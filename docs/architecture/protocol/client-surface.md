# Protocol / Client Surface

> last-verified: 36ea08c6b5 @ 2026-11-06

## Responsibility
Provides the typed client view of the HttpApi and the metadata needed to generate per-flavor clients. Owns the shape declared on the client side; the concrete effect/promise/solid client code lives in `@opencode/client`.

## Key Paths
- `packages/protocol/src/client.ts` — `ClientApi` (HttpApi re-parameterized with client-side middleware identities), `groupNames`, `promiseOmitEndpoints`, `effectOmitEndpoints`
- `packages/client/src/effect/api/`, `packages/client/src/effect/generated/`, `packages/client/src/promise/generated/` — generated client output (do **not** edit by hand)

## Public API / Key Types
- `ClientApi` — `ClientApiShape` built from `makeDefaultApi` with client middleware stand-ins (`client.ts:32`)
- `groupNames` — group id → short name map (`server.server` → `server`, …)
- `promiseOmitEndpoints` / `effectOmitEndpoints` — endpoints excluded per client flavor (e.g. `fs.read`, `pty.connect`)

## Generation
- Regenerate from `packages/client`: `bun run generate` (runs `script/build.ts` via `@opencode/httpapi-codegen`). `bun run check:generated` fails on drift. Never edit generated files.

## Dependencies
- In: `schema`, `protocol/api`.
- Out: `client`.

## Links
- Parent: INDEX.md
