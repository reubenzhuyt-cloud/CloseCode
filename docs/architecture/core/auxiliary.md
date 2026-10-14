# Core / Auxiliary Services

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Smaller Core services that do not warrant their own module doc: image processing, forms/elicitation, commands, key-value store, snapshots, and well-known/remote config. Each is a standalone `Effect` service exposed through the same node graph.

## Key Paths
- `packages/core/src/image.ts`, `image/` — `Image.Service`, resize/decode limits; platform `#photon-wasm` condition (`photon-wasm.{bun,node,workerd}.ts`)
- `packages/core/src/form.ts` — `Form.Service`, `ID`, `Info`, `Field`; elicitation forms (Server `form` route + `form-location` middleware)
- `packages/core/src/command.ts` — `Command.Service`, `Definition`, `Invocation`, `Editor`, `NotFoundError`
- `packages/core/src/kv.ts`, `kv/sql.ts` — `KV.Service` (`@opencode/KV`) global JSON store
- `packages/core/src/snapshot.ts` — `Snapshot.Service` compare/diff/restore (session restore)
- `packages/core/src/wellknown.ts` — `WellKnown` auth/remote-config/manifest schemas
- `packages/core/src/modal/models.ts` — model modal content
- `packages/schema/src/{form,image,command,snapshot,money}.ts`

## Public API / Key Types
- `Image.Service`, `Form.Service`, `Command.Service`, `KV.Service`, `Snapshot.Service`
- `KV` is global (`makeGlobalNode`); `Image`/`Snapshot`/`Command` are location-scoped

## Dependencies
- In: `schema/*`, database, util.
- Out: session (snapshots, forms), tools (command/skill), server (`form`/`command`/`debug` routes).

## Links
- Parent: INDEX.md
