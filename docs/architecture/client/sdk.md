# SDK (`@opencode/sdk`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Composes Client, Core, and Server into an embeddable API (in-process or workerd) exposing the same surface as the server without a separate process. Owns the composition layer; it does not reimplement domain behavior.

## Key Paths
- `packages/sdk/src/index.ts` — `OpenCode`, `Tool`, `ClientError`, `OpenCodeEvent`, `contracts`
- `packages/sdk/src/opencode.ts` — `create(options)` delegating to `PromiseSdk`; `CreateOptions`, `Interface`, `InstanceOptions`, `InstanceConfiguration`
- `packages/sdk/src/tool.ts` — `Tool.RegistrationError`, `Tool.Context`, `Tool.Info` (re-exports plugin/core tool types)
- `packages/sdk/src/contracts.ts` — re-exports schema contracts (`Agent`, `Config`, `Location`, `Model`, `Permission`, `Prompt`, …)
- `packages/sdk/src/promise.ts`, `workerd.ts`, `logging.ts` — promise engine, workerd profile (`internal/workerd`), logging
- `packages/sdk/src/internal/` — `fetch`, `host`, `instances`, `workerd` internals

## Public API / Key Types
- `OpenCode.create(options)` / `OpenCodeWorkerd.create(options)`
- `Tool` namespace (`Context`, `Info`), `ClientError`, `OpenCodeEvent`
- `contracts` re-export of schema types

## Dependencies
- In: `client`, `core`, `server`, `plugin`, `schema`, `util`.
- Out: `sdk` is the top of the composition chain (no packages depend on it).

## Links
- Parent: INDEX.md
