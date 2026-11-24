# Schema (`@opencode/schema`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the serializable domain contracts shared by every package: Effect `Schema` definitions, identifier codecs, and event definitions. It is a leaf package — it must not import Core, Protocol, Server, or Client. Does not own behavior, persistence, or transport.

## Key Paths
- `packages/schema/src/index.ts` — named re-export barrel of all schema modules
- `packages/schema/src/schema.ts` — shared schema helpers/refinements (`AbsolutePath`, `optional`, …)
- `packages/schema/src/config/` — config shapes (`agent`, `command`, `compaction`, `experimental`, `flag`, `lsp`, `mcp`, `media`, `model`, `plugin`, `policy`, `provider`, `reference`, `shell`, `tool-output`, `warming`, `watcher`, `websearch`, `worktree`)
- `packages/schema/src/v1/` — legacy v1 shapes retained for migration
- `packages/schema/src/automation.ts` — automation triggers/actions/status (`aut_` IDs, `runSessionID`)
- `packages/schema/src/blob-store.ts` — blob IDs and content shapes

## Public API / Key Types
- `Agent`, `Artifact`, `Automation`, `BlobStore`, `Command`, `Config`, `Connection`, `Credential`, `Event`, `FileSystem`, `Form`, `Goal`, `Integration`, `Job`, `LLM`, `Location`, `Mcp`, `Model`, `Money`, `Permission`, `PermissionSaved`, `Project`, `Provider`, `Reference`, `Rpc`, `Session`, `SessionInbox`, `SessionStats`, `SessionTransfer`, `Shell`, `Skill`, `Snapshot`, `Tool`, `TokenUsage`, `Pty`, `PersistentPty`, `PtyTicket`, `Question`, `Vcs`, `WebSearch`, `Workspace`, `Worktree`
- `packages/schema/src/event.ts` + `event-manifest.ts` / `durable-event-manifest.ts` — event `Definition`, `versionedType`, durable/ephemeral classification
- `packages/schema/src/session-message.ts`, `session-inbox.ts`, `llm.ts`, `tool.ts` — session/message/tool wire shapes; `tool.ts` `Options.mcpServer`, `Tool.Freeform`
- `packages/schema/src/identifier.ts`, `session-id.ts`, `project-id.ts`, `workspace-id.ts` — branded ID types

## Dependencies
- In: none (leaf; only external `effect`/`zod`).
- Out: `protocol`, `core`, `server`, `client`, `ai`, `plugin`, `tui`, `app`, `ui`, `sdk` — effectively all packages.

## Links
- Parent: INDEX.md
