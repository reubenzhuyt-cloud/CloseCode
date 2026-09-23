export * as SkillInstructions from "./instructions.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import type { Agent } from "@opencode/schema/agent"
import type { Session } from "@opencode/schema/session"
import { optional } from "@opencode/schema/schema"
import { Permission } from "../permission.js"
import { Skill } from "../skill.js"
import { Instructions } from "../instructions/index.js"

export type Level = "off" | "name" | "full"

const Summary = Schema.Struct({
  id: Skill.ID,
  name: Skill.Name,
  description: Schema.String.pipe(optional),
})
type Summary = typeof Summary.Type

const entries = (skills: ReadonlyArray<Summary>) =>
  skills.flatMap((skill) => [
    "  <skill>",
    `    <id>${skill.id}</id>`,
    `    <name>${skill.name}</name>`,
    ...(skill.description === undefined ? [] : [`    <description>${skill.description}</description>`]),
    "  </skill>",
  ])

const render = (skills: ReadonlyArray<Summary>) =>
  [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    "The user may also invoke a skill directly. When that happens, its instructions appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill that is already present this way does not need to be invoked again.",
    ...(skills.length === 0
      ? ["No skills are currently available."]
      : ["<available_skills>", ...entries(skills), "</available_skills>"]),
  ].join("\n")

const update = (previous: ReadonlyArray<Summary>, current: ReadonlyArray<Summary>) => {
  const diff = Instructions.diffByKey(
    previous,
    current,
    (skill) => skill.id,
    (before, after) => before.name !== after.name || before.description !== after.description,
  )
  // Additions and removals render as small deltas; anything else restates the full list.
  if (diff.changed.length > 0 || (diff.added.length === 0 && diff.removed.length === 0))
    return [
      "The available skills have changed. This list supersedes the previous available skills list.",
      render(current),
    ].join("\n")
  return [
    ...(diff.added.length === 0
      ? []
      : ["New skills are available in addition to those previously listed:", ...entries(diff.added)]),
    ...(diff.removed.length === 0
      ? []
      : [
          `The following skill IDs are no longer available and must not be used: ${diff.removed.map((skill) => skill.id).join(", ")}.`,
        ]),
  ].join("\n")
}

export interface Interface {
  /** Lists skills the given ruleset does not deny; callers pass the merged agent and Session permissions. */
  readonly load: (
    permissions: Permission.Ruleset,
    input?: { readonly agent?: Agent.Info; readonly metadata?: Session.Metadata },
  ) => Effect.Effect<Instructions.List>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SkillInstructions") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* Skill.Service

    return Service.of({
      load: Effect.fn("SkillInstructions.load")(function* (permissions, input) {
        const all = yield* skills.list()
        const levels = resolveSkillLevels(input?.agent, input?.metadata, all)
        const available = Skill.available(all, permissions)
          .flatMap((skill) => {
            const level = levels[skill.name] ?? levels[skill.id] ?? "full"
            if (level === "off") return []
            if (skill.description === undefined || skill.autoinvoke === false) return []
            return [{ id: skill.id, name: skill.name, ...(level === "name" ? {} : { description: skill.description }) }]
          })
          .toSorted((a, b) => a.id.localeCompare(b.id))
        return Instructions.make<ReadonlyArray<Summary>>({
          key: Instructions.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(Schema.Array(Summary)),
          read: Effect.succeed(available.length === 0 ? Instructions.removed : available),
          render: {
            initial: render,
            changed: update,
            removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
          },
        })
      }),
    })
  }),
)

/**
 * Resolves one activation level per skill name. Keys may be a skill's name or
 * id: Session overrides win over agent configuration, `*` entries cover
 * unlisted skills, and the agent mode picks the fallback (`off` for subagents,
 * `full` otherwise).
 */
export const resolveSkillLevels = (
  agent: Agent.Info | undefined,
  metadata: Session.Metadata | undefined,
  skills: ReadonlyArray<Pick<Skill.Info, "name" | "id">>,
): Record<string, Level> => {
  const config = agent?.skillActivation ?? {}
  const override = sessionSkillLevels(metadata, agent?.name)
  const fallback: Level = agent?.mode === "subagent" ? "off" : "full"
  return Object.fromEntries(
    skills.map((skill) => [
      skill.name,
      override[skill.name] ??
        override[skill.id] ??
        override["*"] ??
        config[skill.name] ??
        config[skill.id] ??
        config["*"] ??
        fallback,
    ]),
  )
}

const sessionSkillLevels = (
  metadata: Session.Metadata | undefined,
  agentName: Agent.Name | undefined,
): Record<string, Level> => {
  if (agentName === undefined) return {}
  const configured = metadata?.["agent_skills"]
  if (!isRecord(configured)) return {}
  const entry = configured[agentName]
  if (!isRecord(entry)) return {}
  return Object.fromEntries(
    Object.entries(entry).flatMap(([name, value]) => (isLevel(value) ? [[name, value] as const] : [])),
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isLevel = (value: unknown): value is Level => value === "off" || value === "name" || value === "full"

export const node = makeLocationNode({ service: Service, layer, deps: [Skill.node] })
