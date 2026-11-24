# Core / Auxiliary Services

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Smaller Core services that do not warrant their own module doc: image processing, video generation, blobs, artifacts, forms/elicitation, commands, key-value store, snapshots, and well-known/remote config. Each is a standalone `Effect` service exposed through the same node graph.

## Key Paths
- `packages/core/src/image.ts`, `image/` — `Image.Service`, resize/decode limits, `notice.ts` (background image-job notice); platform `#photon-wasm` condition (`photon-wasm.{bun,node,workerd}.ts`)
- `packages/core/src/video-generation.ts` — `VideoGeneration.Service` (global), `StartOptions`, `NotFoundError`; a job record is kept 24h and its videos are blobs (7-day retention)
- `packages/core/src/blob-store.ts` — `BlobStore.Service` (global), `ID`, `DIRECTORY = "blobs"`, `RETENTION = 7 days`, `NotFoundError`/`UnavailableError`, `unsupportedLayer`
- `packages/core/src/artifact.ts` — `Artifact.Service`, pluggable providers (`ProviderCreateInput`, `ProviderImplementation`, `ProviderPrompts`), `DisabledError`/`NotFoundError`/`FileMissingError`
- `packages/core/src/form.ts` — `Form.Service`, `ID`, `Info`, `Field`; elicitation forms (Server `form` route + `form-location` middleware)
- `packages/core/src/command.ts` — `Command.Service`, `Definition`, `Invocation`, `Editor`, `NotFoundError`
- `packages/core/src/kv.ts`, `kv/sql.ts` — `KV.Service` (`@opencode/KV`) global JSON store
- `packages/core/src/snapshot.ts` — `Snapshot.Service` compare/diff/restore (session restore)
- `packages/core/src/wellknown.ts` — `WellKnown` auth/remote-config/manifest schemas
- `packages/core/src/modal/models.ts` — model modal content
- `packages/core/src/managed-policy.ts`, `usage-limits.ts` — managed policy and usage-limit helpers
- `packages/schema/src/{form,image,command,snapshot,money,artifact,blob-store,job}.ts`

## Public API / Key Types
- `Image.Service`, `VideoGeneration.Service`, `BlobStore.Service`, `Artifact.Service`, `Form.Service`, `Command.Service`, `KV.Service`, `Snapshot.Service`
- `KV`, `BlobStore`, `VideoGeneration` are global (`makeGlobalNode`); `Image`/`Snapshot`/`Command`/`Artifact` are location-scoped

## Dependencies
- In: `schema/*`, database, util, filesystem.
- Out: session (snapshots, forms, blobs), tools (command/skill/image/video/artifact), server (`form`/`command`/`debug`/`blob`/`media`/`artifact` routes).

## Links
- Parent: INDEX.md
