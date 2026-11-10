# Schema (`@opencode/schema`)

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns the serializable domain contracts shared by every package: Effect `Schema` definitions, identifier codecs, and event definitions. It is a leaf package — it must not import Core, Protocol, Server, or Client. Does not own behavior, persistence, or transport.

## Key Paths
- `packages/schema/src/index.ts` — named re-export barrel of all schema modules
- `packages/schema/src/schema.ts` — shared schema helpers/refinements
- `packages/schema/src/config/` — config shapes (`agent`, `command`, `compaction`, `experimental`, `flag`, `formatter`, `lsp`, `mcp`, `media`, `model`, `plugin`, `policy`, `provider`, `reference`, `shell`, `tool-output`, `warming`, `watcher`, `websearch`, `worktree`)
- `packages/schema/src/v1/` — legacy v1 shapes retained for migration

## Public API / Key Types
- `Agent`, `Command`, `Config`, `Credential`, `Event`, `FileSystem`, `Form`, `Integration`, `LLM`, `Location`, `Mcp`, `Model`, `Money`, `Permission`, `Project`, `Provider`, `Reference`, `Rpc`, `Session`, `SessionInbox`, `Skill`, `Tool`, `Vcs`, `WebSearch`, `Worktree` (`packages/schema/src/index.ts`)
- `packages/schema/src/event.ts` + `event-manifest.ts` / `durable-event-manifest.ts` — event `Definition`, `versionedType`, durable/ephemeral classification
- `packages/schema/src/session-message.ts`, `session-inbox.ts`, `llm.ts`, `tool.ts` — session/message/tool wire shapes
- `packages/schema/src/identifier.ts`, `session-id.ts`, `project-id.ts`, `workspace-id.ts` — branded ID types

## Dependencies
- In: none (leaf; only external `effect`/`zod`).
- Out: `protocol`, `core`, `server`, `client`, `ai`, `plugin`, `tui`, `app`, `ui`, `sdk` — effectively all packages.

## Links
- Parent: INDEX.md
