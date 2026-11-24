# Server / Codegen

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Generates typed client code and OpenAPI from the Protocol HttpApi. Owns the codegen tool and the generation pipeline wired into `packages/client`. Does not own the contract (protocol) nor the hand-written client runtime.

## Key Paths
- `packages/httpapi-codegen/src/index.ts` — `@opencode/httpapi-codegen`: walks an `HttpApi` into `Operation`/`Group`/`Contract` and emits files (uses Effect `SchemaRepresentation` + prettier)
- `packages/client/script/build.ts` — the `generate` pipeline run via `bun run generate`
- `packages/client/script/generate.ts` — passes `aliases: deprecatedClientPaths` (`:61`, `:67`) to the codegen for both flavors, replacing the old `aliases: true`
- Generated output (do **not** hand-edit): `packages/client/src/effect/api/`, `packages/client/src/effect/generated/`, `packages/client/src/promise/generated/`
- `packages/protocol/openapi.json` — generated OpenAPI document

## Public API / Key Types
- `Operation`, `Group`, `Contract`, `Output` types from `httpapi-codegen`
- `bun run generate` (from `packages/client`); `bun run check:generated` fails on drift (AGENTS.md)

## Notes
- Deprecated top-level aliases come from the frozen `deprecatedClientPaths` set in `packages/protocol/src/client.ts`, not from a blanket flag. An endpoint added today gets no alias; the one exception is the fork's `config.updateAgent`, kept in the set because it shipped un-namespaced in 0.4.0.

## Dependencies
- In: `protocol/api`, `protocol/client` (`deprecatedClientPaths`), `effect`, prettier.
- Out: `@opencode/client` generated surfaces.

## Links
- Parent: INDEX.md
