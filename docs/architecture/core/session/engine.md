# Session / Engine

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
The Session aggregate entry point. `Session.make()` is built once per host scope and exposes `forSession(id)` handles that share host services and reload current state. Owns admission orchestration (prompt/synthetic/compact/shell/skill), metadata mutation, revert staging, and delegation to execution. Does not own the step loop (runner.md) or durable projection (history-persistence.md).

## Key Paths
- `packages/core/src/session/session.ts` — `Session.make` (`:43`), `Handle` type (`:425`), `forSession`
- `packages/core/src/session/schema.ts` — `SessionSchema` (session info, metadata, IDs)
- `packages/core/src/session/error.ts` — `NotFoundError`, `BusyError`, `PromptConflictError`, `InboxConflictError`, `CompactionConflictError`, `SyntheticConflictError`, `MessageNotFoundError`, `UserInterruptedError`
- `packages/core/src/session/revert.ts` — `SessionRevert.stage/clear/commit`
- `packages/core/src/session/shell.ts`, `skill.ts` — shell/skill session operations
- `packages/core/src/session/transfer.ts`, `move.ts`, `fork` (`session-fork`) — transfer/fork

## Public API / Key Types
- `Session.make()` → `{ forSession(id) }`; `Session.Handle`
- Handle ops: `get`, `message`, `view`, `rename`, `setMetadata`, `setPermissions`, `switchAgent`, `switchModel`, `inbox`, `prompt`, `synthetic`, `shell`, `skill`, `compact`, `wait`, `resume`, `interrupt`, `cancelInbox`, `steerInbox`, `queueInbox`, `revert.{stage,clear,commit}`
- `Session.prompt` publishes inbox admission before `execution.wake` unless `resume: false` (admit-only)

## Dependencies
- In: `Bus`, `Database`, `SessionStore`, `Instance`, `SessionExecution`, `SessionInbox`, `FSUtil`, `SessionPrompt`, `SessionRevert`.
- Out: sdk, server (`session` route), tui/app via client.

## Links
- Parent: INDEX.md
