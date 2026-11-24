# Core / Runtime Model

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Defines how every Core service is declared, wired, scoped, and exposed: the Effect `LayerNode` graph, the process-global `Instance` graph, `Location` scoping, and the `State`/`Bus`/`Job` coordination primitives. Does not own domain behavior — it is the substrate those services use.

## Key Paths
- `packages/core/src/instance.ts` — `Instance.graph`, `Instance.layer(ref, options)`, `Services`/`Error` types; the aggregate service graph
- `packages/core/src/instance/service.ts` — `Instance` service (`@opencode/Instance`)
- `packages/core/src/location-services.ts`, `location-service-map.ts` — `buildLocationServiceMap`, `LocationServiceMap.get(ref)` used to resolve per-location instances
- `packages/core/src/state.ts` — `State.Transformable` editor pattern, `reconcile`, `batch`, `shutdown`, `inherit`
- `packages/core/src/bus.ts` — `Bus` publish/subscribe, `reserveSequence`, `latestSequence`, durable vs ephemeral publish
- `packages/core/src/job.ts` — background `Job` service (start/wait/block/background)
- `packages/core/src/effect/` — `app-node-builder`, `app-node-platform`, `keyed-mutex`, `websocket-constructor`, `client-tls/` (`#client-tls` per platform)
- `packages/core/src/app.ts`, `config.ts` — `App` metadata (channel, env) and `Config` service
- `packages/core/src/environment/` — `Environment`/`Environments` (what a file or process op runs against; see machines.md)

## Public API / Key Types
- `makeLocationNode` / `makeGlobalNode` (from `@opencode/util/effect/app-node`) — the two node kinds: bound to a `Location.Ref`, or process-global
- `Instance.layer(ref, options)` — builds the whole services graph for a location
- `State.Transformable<Editor>` — read/transform interface reused by Config, Tool, Permission, Compaction
- `Bus.durable` / `Bus.ephemeral` — sequence-reserved event publication
- `Job` — background work with `background: true` tools and Code Mode jobs

## Dependencies
- In: `schema`, `util/effect`, `effect`, database.
- Out: essentially all Core modules; Server and `sdk` consume `Instance`.

## Links
- Parent: INDEX.md
