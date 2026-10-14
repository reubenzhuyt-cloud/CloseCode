# Session / History & Persistence

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns the projected Session read models and durable rows: loading ordered history, projecting durable events into rows, and the store/query interface used by the runner and Server. Durable events record only irreducible facts; read models fold ordered history. Does not own event publication (events.md) nor admission.

## Key Paths
- `packages/core/src/session/history.ts` — `SessionHistory.load`, `entriesForRunner`, `preview`, `firstUserMessage`, `latestCompaction`, `Boundary`
- `packages/core/src/session/store.ts` — `SessionStore.Service` (`@opencode/SessionStore`): `ListInput` (directory/project/all), `MessagesInput`, get/list queries
- `packages/core/src/session/projector.ts` — `SessionProjector` durable-event projection node (`SessionAlreadyProjected`)
- `packages/core/src/session/sql.ts` — Drizzle tables: `SessionTable`, `SessionMessageTable`, `SessionPendingTable`, `SessionInboxTable`, `InstructionEntryTable`, `InstructionBlobTable`, `InstructionStateTable`
- `packages/core/src/session/message.ts`, `message-updater.ts` — message shape (re-export `@opencode/schema/session-message`) and updates
- `packages/core/src/session/usage.ts`, `stats.ts`, `diff.ts`, `info.ts` — usage, stats, diff, info read models
- `packages/core/src/session/transfer.ts`, `move.ts` — transfer/move persistence
- `packages/schema/src/session-message.ts`, `session-metadata.ts`, `session-stats.ts`, `token-usage.ts`

## Public API / Key Types
- `SessionHistory.load(...)`, `SessionHistory.entriesForRunner(...)`, `SessionHistory.preview(...)`
- `SessionStore.Service`, `SessionStore.ListInput`
- `SessionMessage` schema (re-exported from Core and used by Server/client)

## Dependencies
- In: `Bus`, `Database`, `schema/session-message`.
- Out: `Session.make`, `SessionExecution`, `SessionRunner`, server (`session`/`message` routes).

## Links
- Parent: INDEX.md
