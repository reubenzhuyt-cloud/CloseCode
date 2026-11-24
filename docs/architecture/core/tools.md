# Core / Tools

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the tool registry/service and the built-in tool implementations. A tool is a schema-described callable the model can invoke during a session; the registry lets plugins register/edit tools and `snapshot` turns a permission policy plus per-agent options into the model-visible tool set. Does not own LLM execution (Session runner drives it) or permission evaluation (permissions.md).

## Key Paths
- `packages/core/src/tool.ts` — `Tool.Service`, `Editor`, `Interface`, `Policy {hidden, direct}`, `SnapshotOptions {services, api, tools, toolset}`, `CheckInput`, `NormalizedResult`, `Snapshot`, `codeModeAvailable`, `RegistrationError`
- `packages/core/src/tool/toolset.ts`, `runtime.ts` — toolset assembly and execution runtime; `toolsetAllowsMcp` (`toolset.ts:30`) makes MCP tools **default-deny** (a per-agent `toolset` map must opt them in)
- `packages/core/src/tool.ts:315-345` — `snapshot(policy?, options?)` per-tool loop in fixed order: hidden → whole-tool permission deny → MCP toolset → Code Mode/direct split
- `packages/core/src/tool/plugin/` — built-in tools: `read`, `write`, `edit`, `glob`, `grep`, `cd`, `shell`, `patch`, `file-diff`, `artifact`, `webfetch`, `websearch`, `skill`, `question`, `subagent`, `todo`, `mcp-resource`, `mcp-events`, `session-search`, `session-interrupt`, `automation`, `machine`, `opencode`, `image-generate`, `video-generate`
- `packages/core/src/tool/plugin/skill.ts` — resolves via `Skill.Service.entries()`, then resolves the invoking agent through `Agent.Service` (fallback `{id: context.agent}`) before the `agents` source check so display names match (`Skill.visible`); asserts with `resources: [skill.id]` + `candidates: Skill.resources(skill)` plus `Permission.invocation(context)`, then loads `skills.files(id)` into the 3-arg `Skill.prepare(fs, entry.skill, files)`
- `packages/core/src/tool/plugin/image-generate.ts` — `generate_image`, `MAX_INPUT_BYTES = 20 MiB`; replaces upstream's `experimental_image_generate` (fork keeps the old rule name as a v1 migration, `v1/config/migrate.ts:38`)
- `packages/core/src/tool/plugin/video-generate.ts` — `generate_video`, `MAX_INPUT_BYTES = 100 MiB`, per-job `track`/`notice`/`videoPath` helpers
- `packages/core/src/tool/plugin/session-search.ts` — `opencode.session.search` / `opencode.session.read` Code Mode tools, gated on the `sqlite_fts` flag
- `packages/core/src/tool/mcp.ts`, `read-filesystem.ts`, `http-body.ts`, `html-markdown.ts` — MCP bridging and shared tool helpers
- `packages/core/src/tool/model-policy.ts` — per-model tool policy feeding `SessionContext.select`
- `packages/core/src/codemode/` — Code Mode catalog/instructions/web/job wiring (`catalog.ts`, `instructions.ts`, `tool.ts`, `job.ts`, `path.ts`, `bun.ts`, `api.ts`, `diffs.ts`, `execution.ts`, `fetch.ts`)
- `packages/schema/src/tool.ts` — `Options` (incl. `mcpServer`, `providerOptions`), `Info`, `Freeform`/`FreeformFormat`

## Public API / Key Types
- `Tool.Service` (`@opencode/Tool`), `Tool.Editor` (register/snapshot tools via `State.Transformable`)
- `Tool.Interface.snapshot(policy?, options?)` (`tool.ts:85`) — permission policy + `SnapshotOptions` (per-agent `toolset`, Code Mode `services`/`api`, hidden/direct sets)
- `Tool.Interface.check(CheckInput)` (`tool.ts:90`) — runs a Code Mode program with no model step over only the named tools (permission-filtered, no `fetch`)
- `Tool.Interface.codeModeTools(paths)` — resolves Code Mode tool paths for a request
- `Tool.Context`, `Tool.Result`, `Tool.Metadata`, `Tool.Options`, `Tool.Freeform`
- `packages/core/src/tool/AGENTS.md` — local tool conventions

## Dependencies
- In: `schema/tool`, permissions (`PermissionPolicy`), filesystem, shell, `@opencode/codemode`, `@opencode/plugin`.
- Out: session runner (invokes tools), server handlers (`tool`/`session` routes).

## Links
- Parent: INDEX.md
