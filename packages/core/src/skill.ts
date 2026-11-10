export * as Skill from "./skill.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import path from "path"
import { Context, Effect, Layer, Types } from "effect"
import { Skill } from "@opencode/schema/skill"
import { Bus } from "./bus.js"
import { Permission } from "./permission.js"
import { State } from "./state.js"

export const DirectorySource = Skill.DirectorySource
export type DirectorySource = Skill.DirectorySource

export const UrlSource = Skill.UrlSource
export type UrlSource = Skill.UrlSource

export const EmbeddedSource = Skill.EmbeddedSource
export type EmbeddedSource = Skill.EmbeddedSource

export const Source = Skill.Source
export type Source = Skill.Source

export const Info = Skill.Info
export type Info = Skill.Info
export const ID = Skill.ID
export type ID = Skill.ID
export const Name = Skill.Name
export type Name = Skill.Name
export const Origin = Skill.Origin
export type Origin = Skill.Origin
export const Registration = Skill.Registration
export type Registration = Skill.Registration
export const Diagnostic = Skill.Diagnostic
export type Diagnostic = Skill.Diagnostic
export const DiagnosticSkill = Skill.DiagnosticSkill
export type DiagnosticSkill = Skill.DiagnosticSkill
export const DiagnosticDenial = Skill.DiagnosticDenial
export type DiagnosticDenial = Skill.DiagnosticDenial
export const DiagnosticWarning = Skill.DiagnosticWarning
export type DiagnosticWarning = Skill.DiagnosticWarning

export { Event } from "@opencode/schema/skill"

/** Permission resources for a skill: its ID plus one `tag:<tag>` resource per tag. */
export const resources = (skill: Pick<Info, "id" | "tags">): string[] => [
  skill.id,
  ...(skill.tags ?? []).map((tag) => `tag:${tag}`),
]

export const available = (skills: ReadonlyArray<Info>, permissions: Permission.Ruleset) =>
  skills.filter((skill) => Permission.evaluateAny("skill", resources(skill), permissions).effect !== "deny")

export const uri = (id: string, file?: string) => (file ? `skill://${id}/${file}` : `skill://${id}`)

export const isUri = (value: string) => value.startsWith("skill://")

export const toModelOutput = (skill: Info, files: ReadonlyArray<string>) => {
  const directory = isUri(skill.path) ? uri(skill.id) : path.dirname(skill.path)
  return [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    "",
    skill.content.trim(),
    "",
    `Base directory for this skill: ${directory}`,
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
    "Note: file list is sampled.",
    "",
    "<skill_files>",
    ...files.map((file) => `<file>${file}</file>`),
    "</skill_files>",
    "</skill_content>",
  ].join("\n")
}

export const prepare = Effect.fn("Skill.prepare")(function* (
  fs: FSUtil.Interface,
  skill: Info,
  virtualFiles?: ReadonlyMap<string, string>,
) {
  if (isUri(skill.path)) {
    const directory = uri(skill.id)
    const files = Array.from(virtualFiles?.keys() ?? [])
      .filter((file) => file !== "SKILL.md")
      .toSorted()
      .slice(0, 10)
      .map((file) => uri(skill.id, file))
    return {
      directory,
      output: toModelOutput(skill, files),
    }
  }
  const directory = path.dirname(skill.path)
  const files =
    path.basename(skill.path) === "SKILL.md"
      ? (yield* fs.scan("**/*", {
          cwd: directory,
          absolute: true,
          include: "file",
          dot: true,
          ignore: FSUtil.ignoreGlobs,
        }))
          .filter((file) => path.basename(file) !== "SKILL.md")
          .toSorted()
          .slice(0, 10)
      : []
  return {
    directory,
    output: toModelOutput(skill, files),
  }
})

export interface Entry {
  readonly skill: Info
  readonly source: Origin
  /** Agent IDs or names allowed to use this entry; absent means unrestricted. */
  readonly agents?: readonly string[]
}

export interface ShadowedEntry extends Entry {
  /** Origin of the entry that displaced this one for the same ID. */
  readonly shadowedBy: Origin
}

/** True when the entry's source restriction permits the agent. Unknown agents cannot be restricted. */
export const visible = (entry: Entry, agent?: { readonly id: string; readonly name?: string }) =>
  entry.agents === undefined ||
  agent === undefined ||
  entry.agents.includes(agent.id) ||
  (agent.name !== undefined && entry.agents.includes(agent.name))

export type Data = {
  skills: Map<ID, Types.DeepMutable<Entry>>
  files: Map<ID, ReadonlyMap<string, string>>
  shadowed: Types.DeepMutable<ShadowedEntry>[]
}

const precedence: Record<Origin, number> = { project: 2, global: 1, plugin: 0 }

/** The editor accepts either registration metadata or a map of virtual files for `skill://` skills. */
const isRegistration = (options: Registration | Readonly<Record<string, string>>): options is Registration =>
  "source" in options || "agents" in options

export type Editor = {
  list: () => readonly Types.DeepMutable<Info>[]
  get: (id: string) => Types.DeepMutable<Info> | undefined
  add: (skill: Info, options?: Registration | Readonly<Record<string, string>>) => void
  update: (id: string, update: (skill: Types.DeepMutable<Info>) => void) => void
  remove: (id: string) => void
}

export interface Interface extends State.Transformable<Editor> {
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  readonly files: (id: ID) => Effect.Effect<ReadonlyMap<string, string> | undefined>
  readonly list: () => Effect.Effect<Info[]>
  /** Effective entries with their registration source and agent restriction. */
  readonly entries: () => Effect.Effect<Entry[]>
  /** Entries that lost same-ID resolution, kept for diagnostics. */
  readonly shadowed: () => Effect.Effect<ShadowedEntry[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service

    const state = State.create<Data, Editor>({
      name: "skill",
      initial: () => ({ skills: new Map(), files: new Map(), shadowed: [] }),
      editor: (editor) => ({
        list: () => Array.from(editor.skills.values(), (entry) => entry.skill),
        get: (id) => editor.skills.get(ID.make(id))?.skill,
        add: (skill, options) => {
          const registration = options !== undefined && isRegistration(options) ? options : undefined
          const virtual = options !== undefined && !isRegistration(options) ? options : undefined
          const source = registration?.source ?? "plugin"
          const entry = {
            skill: { ...skill },
            source,
            ...(registration?.agents === undefined ? {} : { agents: registration.agents }),
          } as Types.DeepMutable<Entry>
          const current = editor.skills.get(skill.id)
          if (current && precedence[source] < precedence[current.source]) {
            editor.shadowed.push({ ...entry, shadowedBy: current.source })
            return
          }
          if (current) editor.shadowed.push({ ...current, shadowedBy: source })
          editor.skills.set(skill.id, entry)
          const files = virtual
            ? Object.entries(virtual)
                .filter(([file]) => file !== "SKILL.md")
                .toSorted(([a], [b]) => a.localeCompare(b))
            : []
          if (files.length === 0) editor.files.delete(skill.id)
          else editor.files.set(skill.id, new Map(files))
        },
        update: (id, update) => {
          const current = editor.skills.get(ID.make(id))
          if (!current) return
          update(current.skill)
          current.skill.id = ID.make(id)
        },
        remove: (id) => {
          const key = ID.make(id)
          editor.skills.delete(key)
          editor.files.delete(key)
          editor.shadowed = editor.shadowed.filter((entry) => entry.skill.id !== id)
        },
      }),
      notify: State.changes(
        (data) => [
          Array.from(data.skills.values()),
          Array.from(data.files, ([id, entries]) => [id, Array.from(entries)]),
        ],
        () => bus.publish(Skill.Event.Updated, {}).pipe(Effect.asVoid),
      ),
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      get: Effect.fn("Skill.get")(function* (id) {
        return state.get().skills.get(id)?.skill
      }),
      files: Effect.fn("Skill.files")(function* (id) {
        const current = state.get()
        return current.skills.has(id) ? current.files.get(id) : undefined
      }),
      list: Effect.fn("Skill.list")(function* () {
        return Array.from(state.get().skills.values(), (entry) => entry.skill)
      }),
      entries: Effect.fn("Skill.entries")(function* () {
        return Array.from(state.get().skills.values())
      }),
      shadowed: Effect.fn("Skill.shadowed")(function* () {
        return state.get().shadowed
      }),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Bus.node],
})
