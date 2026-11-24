# Client Runtime (`@opencode/client`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Headless client for the V2 server: discovers/ensures/stops a background server, holds the typed generated API in three flavors (effect, promise, solid), and manages connections/event subscriptions. Client runtime code may depend on Schema and Protocol but **never Core or Server**.

## Key Paths
- `packages/client/src/service.ts`, `effect/service.ts`, `promise/service.ts` — `DiscoverOptions`, `EnsureOptions`, `StopOptions`, `Info`; `discover`/`incumbent`/`ensure`/`stop`/`headers`
- `packages/client/src/service-probe.ts` — shared probe helpers (`decide`/`headers`/`probeResult`/`same`); `fallback()` returns the fork registration file `<state>/opencode/closecode-service.json` (written by `cli/src/services/service-config.ts`)
- `packages/client/src/service-contender.ts`, `service-version.ts`, `service-timing.ts` — process contention, version matching, ensure timing
- `packages/client/src/contract.ts` — re-exports `ClientApi`, `clientNamespace`, `groupNames`, `promiseOmitEndpoints`, `effectOmitEndpoints` from `@opencode/protocol/client`
- `packages/client/src/effect/` — `client.ts` (`OpenCode.make`), `api.ts`, `rpc.ts`, `service.ts`, `generated/`
- `packages/client/src/promise/` — same shape for promise consumers (`generated/`)
- `packages/client/src/solid/` — `connection.ts` (`createClientConnection`), `data.ts` (`createData`), `pty.ts`
- `packages/client/src/rpc-runtime.ts`, `shared-events.ts`, `pty-handoff.ts`

## Public API / Key Types
- `OpenCode.make({ baseUrl })` per flavor; `OpenCodeClient`
- `service.discover/ensure/stop`, `Info`, `Endpoint`
- `createClientConnection(api, options)`, `createData(config)`, `DataSessionStatus`
- `OpenCodeEvent` (promise flavor re-export), `RpcRuntime`

## Notes
- One-shot clients (CLI commands, ACP, SDK callers) wait on their side for what they need, e.g. plugin startup in `cli/src/services/plugin-startup.ts`; the server never waits for plugins (AGENTS.md "Plugin Loading").

## Dependencies
- In: `schema`, `protocol` (client surface), `effect`.
- Out: `cli`, `tui`, `app`, `session-ui`, `plugin`, `sdk`.

## Links
- Parent: INDEX.md
