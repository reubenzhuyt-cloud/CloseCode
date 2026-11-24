# Session / History & Persistence

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the durable read models and persistence for a Session: projected message history, the store/query interface, and the tables behind history, inbox, instructions, blobs, and search. Does not own admission (inbox-prompt.md) or the step loop (runner.md).

## Key Paths
- `packages/core/src/session/history.ts` — `load`, `entriesForRunner`, `withParts`, row decoders, `NativeWindow`
- `packages/core/src/session/store.ts` — `SessionStore.Service`, `ListInput`/`MessagesInput`
- `packages/core/src/session/projector.ts` — durable-event → row projection
- `packages/core/src/session/sql.ts` — `SessionTable`, `SessionMessageTable`, `SessionPartTable`, `SessionInboxTable`, `InstructionEntryTable`, `InstructionBlobTable`, `InstructionStateTable`, `BlobTable`, `BlobRefTable`
- `packages/core/src/session/blob.ts` — `media_blob` storage and `media:` refs
- `packages/core/src/session/search*.ts` — SQLite FTS index and session search read model (`sqlite_fts` flag)
- `packages/core/src/session/{message,message-updater,usage,stats,diff,info,transfer,move}.ts` — read models and transfer/move persistence
- `packages/schema/src/session-message.ts`, `session-metadata.ts`, `session-stats.ts`, `token-usage.ts`

## Public API / Key Types
- `SessionHistory.load(...)`, `SessionHistory.entriesForRunner(...)`, `SessionHistory.withParts(...)`
- `SessionStore.Service`, `SessionStore.ListInput`, `SessionStore.MessagesInput`
- `SessionSearch` (`SearchOutput`, `ReadOutput`, `IndexUnavailableError`), `SessionSearchBuild`

## Dependencies
- In: `Database`, `SessionMessage` schema, `Bus` (projection trigger), `Flag` (`media_blob`, `sqlite_fts`).
- Out: `session/engine`, `session/runner`, `session/execution`, server handlers, tools (`session-search`).

## Links
- Parent: INDEX.md
