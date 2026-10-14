# Util (`@opencode/util`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Cross-cutting helpers shared across the monorepo plus the Effect node/layer infrastructure that Core builds its service graph on. Owns no domain concepts. Leaf-ish: depends mostly on `effect` and Node/Bun builtins.

## Key Paths
- `packages/util/src/` — flat utilities: `binary`, `bom`, `encode`, `hash`, `path`, `glob`, `glob`, `retry`, `flock`, `cross-spawn-spawner`, `process`, `npm`, `npm-config`, `patch`, `fs-util`, `global-roots`, `runtime-import`, `session-title-fallback`
- `packages/util/src/effect/` — `app-node` graph helpers (`makeLocationNode`, `makeGlobalNode`, node providers/consumers), runtime helpers
- `packages/util/src/observability/` — tracing/metrics support
- `packages/util/src/runtime/`
- `packages/util/src/global-roots.workerd.ts` — workerd variant (platform conditional)

## Public API / Key Types
- `effect/app-node` — `LayerNode.Provider`, `LayerNode.Output`, `makeLocationNode`, `makeGlobalNode`; the primitives Core uses to declare services
- Path/encode/hash/flock/retry helpers used by Core and Server
- Platform-conditional modules resolved via `#` imports in consuming packages

## Dependencies
- In: `effect` (external).
- Out: `core`, `server`, `client`, `plugin`, `tui`, `app`, `session-ui`, `sdk`.

## Links
- Parent: INDEX.md
