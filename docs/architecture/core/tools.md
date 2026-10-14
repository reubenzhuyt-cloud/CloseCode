# Core / Tools

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns the tool registry/service and the built-in tool implementations. A tool is a schema-described callable the model can invoke during a session; the registry lets plugins register/edit tools. Does not own LLM execution (Session runner drives it) or permissions (Permission service gates it).

## Key Paths
- `packages/core/src/tool.ts` — `Tool.Service`, `Editor`, `Interface`, `NormalizedResult`, `RegistrationError`; re-exports `CallID`, `Content`, `Error`, `TextContent` from `@opencode/schema/tool`
- `packages/core/src/tool/toolset.ts`, `runtime.ts` — toolset assembly and execution runtime
- `packages/core/src/tool/plugin/` — built-in tools: `read`, `write`, `edit`, `glob`, `grep`, `shell`, `patch`, `file-diff`, `webfetch`, `websearch`, `skill`, `question`, `subagent`, `mcp-resource`, `opencode`
- `packages/core/src/tool/mcp.ts`, `read-filesystem.ts`, `http-body.ts`, `html-markdown.ts` — MCP bridging and shared tool helpers
- `packages/core/src/codemode/` — codemode tool catalog/instructions (`catalog.ts`, `instructions.ts`, `tool.ts`, `web.ts`)

## Public API / Key Types
- `Tool.Service` (`@opencode/Tool`), `Tool.Editor` (register/snapshot tools via `State.Transformable`)
- `Tool.Context`, `Tool.Result`, `Tool.Metadata`, `Tool.Options` (from `schema/tool`)
- `packages/core/src/tool/AGENTS.md` — local tool conventions

## Dependencies
- In: `schema/tool`, permissions, filesystem, shell, `@opencode/codemode`, `@opencode/plugin`.
- Out: session runner (invokes tools), server handlers (`tool`/`session` routes).

## Links
- Parent: INDEX.md
