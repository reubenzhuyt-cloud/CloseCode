# Session / Engine

> last-verified: 754ee05a22 @ 2026-11-26

## Responsibility
The Session aggregate entry point. `Session.make()` is built once per host scope and exposes `forSession(id)` handles that share host services and reload current state. Owns admission orchestration (prompt/synthetic/command/shell/skill), metadata mutation, cwd, revert staging, and delegation to execution. Does not own the step loop (runner.md) or durable projection (history-persistence.md).

## Key Paths
- `packages/core/src/session/session.ts` — `make` (`:36`), `Handle` type (`:405`), `forSession`; `packages/core/src/session.ts` — `Session.Service`, `Interface`
- `packages/core/src/session/schema.ts` — `SessionSchema` (session info, metadata, IDs)
- `packages/core/src/session/error.ts` — `NotFoundError`, `BusyError`, `PromptConflictError`, `InboxConflictError`, `CompactionConflictError`, `SyntheticConflictError`, `MessageNotFoundError`, `UserInterruptedError`
- `packages/core/src/session/revert.ts` — `SessionRevert.stage/clear/commit`
- `packages/core/src/session/{shell,skill,command,generate,synthetic}.ts` — per-operation admission paths
- `packages/core/src/session/cwd.ts`, `cwd-store.ts`, `cwd-instructions.ts` — per-session working directory, its persistence, and the instruction block describing it
- `packages/core/src/session/move.ts`, `transfer.ts`, `affinity.ts` — move/transfer and location affinity
- `packages/core/src/session/search.ts`, `search-index.ts`, `search-build.ts`, `background.ts`, `background-result.ts`, `subagent-*` — session search (FTS), background work, subagents

## Public API / Key Types
- `Session.make()` → `{ forSession(id) }`; `Session.Handle`
- Handle ops: `get`, `message`, `view`, `rename`, `archive`/`unarchive`, `setMetadata`, `setPermissions`, `switchAgent`, `switchModel`, `cwd`/`setCwd`, `inbox`, `prompt`, `synthetic`, `command`, `shell`, `skill`, `compact`, `wait`, `resume`, `interrupt`, `cancelInbox`, `steerInbox`, `queueInbox`, `generate`, `background`, `revert.{stage,clear,commit}`
- `Session.prompt` publishes inbox admission before `execution.wake` unless `resume: false` (admit-only)
- `Session.cwd`/`setCwd` are experimental: a `Environment.Place` (local or `machine:/path`), undefined clears it

## Notes
- `Session.Metadata` is declared host-supplied and opaque to core (`schema/src/session-metadata.ts`), with one fork exception: core's settlement path reads and clears the `post-finish` key (`session/execution/subagent-report.ts`). It therefore shows up in `Session.Info.metadata` for as long as one settlement takes; see session/execution.md.
- `setMetadata` publishes `session.metadata.updated` with the whole map, so callers replace it rather than merge.

## Dependencies
- In: `Bus`, `Database`, `SessionStore`, `Instance`, `SessionExecution`, `SessionInbox`, `FSUtil`, `SessionPrompt`, `SessionRevert`, `Environment`.
- Out: sdk, server (`session` route), tui/app via client.

## Links
- Parent: INDEX.md
