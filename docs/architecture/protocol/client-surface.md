# Protocol / Client Surface

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Provides the typed client view of the HttpApi and the metadata needed to generate per-flavor clients. Owns the shape declared on the client side; the concrete effect/promise/solid client code lives in `@opencode/client`.

## Key Paths
- `packages/protocol/src/client.ts` — `ClientApi` (HttpApi re-parameterized with client-side middleware identities), `groupNames`, `promiseOmitEndpoints`, `effectOmitEndpoints`
- `packages/client/src/effect/api/`, `packages/client/src/effect/generated/`, `packages/client/src/promise/generated/` — generated client output (do **not** edit by hand)

## Public API / Key Types
- `ClientApi` — `ClientApiShape` built from `makeDefaultApi` with client middleware stand-ins (`client.ts:18`, value at `:28`)
- `groupNames` — group id → short name map (`server.server` → `server`, `server.experimental` → `experimental`, …)
- `promiseOmitEndpoints` / `effectOmitEndpoints` — endpoints excluded per client flavor (e.g. `fs.read`, `pty.connect`)

## Generation
- Regenerate from `packages/client`: `bun run generate` (runs `script/build.ts` via `@opencode/httpapi-codegen`). `bun run check:generated` = regenerate + `git diff --exit-code -- src/promise/generated src/effect/generated src/effect/api`. Never edit generated files.
- Fork-only operations (e.g. `experimental.config.updateAgent`) exist only in regenerated output — after a Protocol change, regeneration is what restores them; drift fails CI.

## Dependencies
- In: `schema`, `protocol/api`.
- Out: `client`.

## Links
- Parent: INDEX.md
