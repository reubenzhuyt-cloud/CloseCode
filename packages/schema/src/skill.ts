export * as Skill from "./skill.js"

import { Schema } from "effect"
import { optional } from "./schema.js"
import { AbsolutePath } from "./schema.js"
import { ephemeral, inventory } from "./event.js"

export const ID = Schema.String.pipe(Schema.brand("Skill.ID"), Schema.annotate({ identifier: "Skill.ID" }))
export type ID = typeof ID.Type

export const Name = Schema.String.pipe(Schema.brand("Skill.Name"), Schema.annotate({ identifier: "Skill.Name" }))
export type Name = typeof Name.Type

export interface DirectorySource extends Schema.Schema.Type<typeof DirectorySource> {}
export const DirectorySource = Schema.Struct({
  type: Schema.tag("directory"),
  path: AbsolutePath,
}).annotate({ identifier: "Skill.DirectorySource" })

export interface UrlSource extends Schema.Schema.Type<typeof UrlSource> {}
export const UrlSource = Schema.Struct({
  type: Schema.tag("url"),
  url: Schema.String,
}).annotate({ identifier: "Skill.UrlSource" })

/** Where a registered skill came from; registry entries resolve same-ID conflicts by this precedence. */
export const Origin = Schema.Literals(["project", "global", "plugin"]).annotate({
  identifier: "Skill.Origin",
  description: "Skill registration origin: project and global disk sources outrank plugin-provided entries",
})
export type Origin = typeof Origin.Type

export interface Registration extends Schema.Schema.Type<typeof Registration> {}
export const Registration = Schema.Struct({
  source: Origin.pipe(optional),
  agents: Schema.Array(Schema.String).pipe(optional),
}).annotate({ identifier: "Skill.Registration" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  name: Name,
  description: Schema.String.pipe(optional),
  autoinvoke: Schema.Boolean.pipe(optional),
  tags: Schema.Array(Schema.String).pipe(optional),
  path: AbsolutePath,
  content: Schema.String,
}).annotate({ identifier: "Skill.Info" })

export interface DiagnosticSkill extends Schema.Schema.Type<typeof DiagnosticSkill> {}
export const DiagnosticSkill = Schema.Struct({
  id: ID,
  name: Name,
  description: Schema.String.pipe(optional),
  tags: Schema.Array(Schema.String).pipe(optional),
  source: Origin,
  shadowedBy: Origin.pipe(optional),
}).annotate({ identifier: "Skill.DiagnosticSkill" })

export interface DiagnosticDenial extends Schema.Schema.Type<typeof DiagnosticDenial> {}
export const DiagnosticDenial = Schema.Struct({
  id: ID,
  rule: Schema.String,
  effect: Schema.Literal("deny"),
  origin: Schema.Literals(["agent", "global", "session"]),
  originPath: Schema.String.pipe(optional),
}).annotate({ identifier: "Skill.DiagnosticDenial" })

export interface DiagnosticWarning extends Schema.Schema.Type<typeof DiagnosticWarning> {}
export const DiagnosticWarning = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
}).annotate({ identifier: "Skill.DiagnosticWarning" })

export interface Diagnostic extends Schema.Schema.Type<typeof Diagnostic> {}
export const Diagnostic = Schema.Struct({
  agent: Schema.String,
  visible: Schema.Array(DiagnosticSkill),
  denied: Schema.Array(DiagnosticDenial),
  shadowed: Schema.Array(DiagnosticSkill),
  warnings: Schema.Array(DiagnosticWarning).pipe(optional),
}).annotate({ identifier: "Skill.Diagnostic" })

const Updated = ephemeral({ type: "skill.updated", schema: {} })
export const Event = { Updated, Definitions: inventory(Updated) }

export interface EmbeddedSource extends Schema.Schema.Type<typeof EmbeddedSource> {}
export const EmbeddedSource = Schema.Struct({
  type: Schema.tag("embedded"),
  skill: Schema.suspend(() => Info),
}).annotate({ identifier: "Skill.EmbeddedSource" })

export type Source = DirectorySource | UrlSource | EmbeddedSource
export const Source = Object.assign(
  Schema.Union([DirectorySource, UrlSource, EmbeddedSource]).pipe(
    Schema.toTaggedUnion("type"),
    Schema.annotate({ identifier: "Skill.Source" }),
  ),
  {
    equals: (a: Source, b: Source) => {
      if (a.type !== b.type) return false
      if (a.type === "directory" && b.type === "directory") return a.path === b.path
      if (a.type === "url" && b.type === "url") return a.url === b.url
      if (a.type === "embedded" && b.type === "embedded") return a.skill.id === b.skill.id
      return false
    },
    key: (source: Source) =>
      source.type === "directory"
        ? `directory:${source.path}`
        : source.type === "url"
          ? `url:${source.url}`
          : `embedded:${source.skill.id}`,
  },
)
