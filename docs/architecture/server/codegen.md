# Server / Codegen

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Generates typed client code and OpenAPI from the Protocol HttpApi. Owns the codegen tool and the generation pipeline wired into `packages/client`. Does not own the contract (protocol) nor the hand-written client runtime.

## Key Paths
- `packages/httpapi-codegen/src/index.ts` — `@opencode/httpapi-codegen`: walks an `HttpApi` into `Operation`/`Group`/`Contract` and emits files (uses Effect `SchemaRepresentation` + prettier)
- `packages/client/script/build.ts` — the `generate` pipeline run via `bun run generate`
- Generated output (do **not** hand-edit): `packages/client/src/effect/api/`, `packages/client/src/effect/generated/`, `packages/client/src/promise/generated/`
- `packages/protocol/openapi.json` — generated OpenAPI document

## Public API / Key Types
- `Operation`, `Group`, `Contract`, `Output` types from `httpapi-codegen`
- `bun run generate` (from `packages/client`); `bun run check:generated` fails on drift (AGENTS.md)

## Dependencies
- In: `protocol/api`, `effect`, prettier.
- Out: `@opencode/client` generated surfaces.

## Links
- Parent: INDEX.md
