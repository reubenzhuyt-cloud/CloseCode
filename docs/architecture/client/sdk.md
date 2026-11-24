# SDK (`@opencode/sdk`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Composes Client, Core, and Server into an embeddable API (in-process or workerd) exposing the same surface as the server without a separate process. Owns the composition layer; it does not reimplement domain behavior.

## Key Paths
- `packages/sdk/src/index.ts` — `OpenCode`, `Tool`, `ClientError`, `OpenCodeEvent`, `contracts`
- `packages/sdk/src/opencode.ts` — `create(options)` delegating to `PromiseSdk` (`promise.ts`); `CreateOptions`, `Interface`, `InstanceOptions`, `InstanceConfiguration`
- `packages/sdk/src/tool.ts` — `Tool.RegistrationError`, `Tool.Context`, `Tool.Info` (re-exports plugin/core tool types)
- `packages/sdk/src/contracts.ts` — re-exports schema contracts (`Agent`, `Config`, `Location`, `Model`, `Permission`, `Prompt`, …)
- `packages/sdk/src/promise.ts`, `workerd.ts`, `logging.ts`, `effect/` — promise engine, workerd profile (`internal/workerd`), logging, effect API
- `packages/sdk/src/internal/` — `fetch`, `host`, `instances`, `workerd` internals

## Public API / Key Types
- `OpenCode.create(options)` / workerd profile via `workerd.ts`
- `Tool` namespace (`Context`, `Info`), `ClientError`, `OpenCodeEvent`
- `contracts` re-export of schema types

## Notes
- One-shot SDK callers own their own plugin-settling wait; the embedded server never waits for plugins (AGENTS.md "Plugin Loading").

## Dependencies
- In: `client`, `core`, `server`, `plugin`, `schema`, `util`.
- Out: `sdk` is the top of the composition chain (no packages depend on it).

## Links
- Parent: INDEX.md
