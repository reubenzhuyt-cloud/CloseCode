export * as ConfigAgent from "./agent.js"

import { Schema } from "effect"
import { Permission } from "../permission.js"
import { optional, PositiveInt } from "../schema.js"
import { ConfigModel } from "./model.js"
import { ConfigProvider } from "./provider.js"

export const Color = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))

export class Info extends Schema.Class<Info>("Config.Agent")({
  model: ConfigModel.Selection.pipe(optional),
  request: ConfigProvider.Request.pipe(optional),
  system: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]).pipe(optional),
  hidden: Schema.Boolean.pipe(optional),
  color: Color.pipe(optional),
  steps: PositiveInt.pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  permissions: Permission.Ruleset.pipe(optional),
  toolset: Schema.Record(Schema.String, Schema.Boolean)
    .annotate({
      description:
        "Visibility allowlist for MCP tools. Keys are glob patterns matched against MCP tool ids or `mcp:<server>`; MCP tools are hidden unless a pattern allows them. Built-in tools are always visible.",
    })
    .pipe(optional),
}) {}
