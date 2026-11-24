# Client Surface

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Provides the typed client view of the HttpApi and the metadata the codegen needs for each client flavor. Owns the contract the generated clients are derived from, plus the deprecated-path set that drives aliases.

## Key Paths
- `packages/protocol/src/client.ts` — `ClientApi`, `groupNames`, `clientNamespace`, `deprecatedClientPaths`, `promiseOmitEndpoints`, `effectOmitEndpoints`
- `packages/client/src/contract.ts` — re-exports the above for client consumers
- `packages/client/script/generate.ts` — passes `deprecatedClientPaths` as `aliases`

## Public API / Key Types
- `ClientApi` — the API with middleware identities swapped for client-side stand-ins
- `groupNames` — group id → SDK namespace (`server.experimental` → `experimental`)
- `clientNamespace(path)` — `"experimental"` for `/api/experimental…`
- `deprecatedClientPaths` — frozen set; the only paths that keep a top-level alias. The fork's `config.updateAgent` is in it because it shipped un-namespaced in 0.4.0.
- `promiseOmitEndpoints`, `effectOmitEndpoints` — per-flavor omissions for streaming/raw endpoints

## Rules
- Regenerate from `packages/client` with `bun run generate`; verify with `bun run check:generated`. Never edit generated files by hand.
- Adding an endpoint under `/api/experimental` puts it under `client.experimental.*` automatically; do not add it to `deprecatedClientPaths` unless it previously shipped un-namespaced.

## Dependencies
- In: `protocol/api`, `protocol/groups`.
- Out: `packages/client` generated surfaces, `sdk`.

## Links
- Parent: INDEX.md
