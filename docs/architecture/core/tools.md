# Core / Tools

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns the tool registry/service and the built-in tool implementations. A tool is a schema-described callable the model can invoke during a session; the registry lets plugins register/edit tools. Does not own LLM execution (Session runner drives it) or permissions (Permission service gates it).

## Key Paths
- `packages/core/src/tool.ts` — `Tool.Service`, `Editor`, `Interface`, `NormalizedResult`, `RegistrationError`; re-exports `CallID`, `Content`, `Error`, `TextContent` from `@opencode/schema/tool`
- `packages/core/src/tool/toolset.ts`, `runtime.ts` — toolset assembly and execution runtime; `toolsetAllowsMcp` (`toolset.ts:30`) makes MCP tools **default-deny** (a per-agent `toolset` map must opt them in)
- `packages/core/src/tool/plugin/` — built-in tools: `read`, `write`, `edit`, `glob`, `grep`, `shell`, `patch`, `file-diff`, `webfetch`, `websearch`, `skill`, `question`, `subagent`, `mcp-resource`, `opencode`
- `packages/core/src/tool/plugin/skill.ts` — resolves via `Skill.Service.entries()`, then resolves the invoking agent through `Agent.Service` (fallback `{id: context.agent}`) before the `agents` source check so display names match (`Skill.visible`); asserts with `resources: [skill.id]` + `candidates: Skill.resources(skill)` plus `Permission.invocation(context)`, then loads `skills.files(id)` into the 3-arg `Skill.prepare(fs, entry.skill, files)`
- `packages/core/src/tool/mcp.ts`, `read-filesystem.ts`, `http-body.ts`, `html-markdown.ts` — MCP bridging and shared tool helpers
- `packages/core/src/codemode/` — codemode tool catalog/instructions (`catalog.ts`, `instructions.ts`, `tool.ts`, `web.ts`)

## Public API / Key Types
- `Tool.Service` (`@opencode/Tool`), `Tool.Editor` (register/snapshot tools via `State.Transformable`)
- `Tool.Interface.snapshot(permissions?, toolset?)` (`tool.ts:48`) — per-agent MCP `toolset` alongside the permission ruleset; `Tool.Interface.check(CheckInput)` (`tool.ts:56`) runs a Code Mode program with no model step over only the named tools (permission-filtered, no `fetch`)
- `Tool.Context`, `Tool.Result`, `Tool.Metadata`, `Tool.Options` (from `schema/tool`)
- `packages/core/src/tool/AGENTS.md` — local tool conventions

## Dependencies
- In: `schema/tool`, permissions, filesystem, shell, `@opencode/codemode`, `@opencode/plugin`.
- Out: session runner (invokes tools), server handlers (`tool`/`session` routes).

## Links
- Parent: INDEX.md
