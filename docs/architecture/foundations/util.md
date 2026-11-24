# Util (`@opencode/util`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Cross-cutting helpers shared across the monorepo plus the Effect node/layer infrastructure that Core builds its service graph on. Owns no domain concepts. Leaf-ish: depends mostly on `effect` and Node/Bun builtins.

## Key Paths
- `packages/util/src/` — flat one-file utilities (`path`, `hash`, `glob`, `flock`, `fs-util`, `process`, `process-signal`, `npm`, `npm-config`, `patch`, `retry`, `encode`, `base64`, `binary`, `bom`, `qr`, `uuid`, `open`, `duration`, `record`, `teardown`, `abort`, `no-timeout-fetch`, `execute-output`, `text-boundary`, `session-title-fallback`, `session-turn`, `session-mention`, `global`, `global-roots`, `artifact`, `activity-calendar`, …; `*.test.ts` siblings colocated)
- `packages/util/src/effect/` — `app-node.ts` graph helpers (`makeLocationNode`, `makeGlobalNode`, node providers/consumers), `layer-node.ts`, `app-node-platform.ts`, runtime helpers
- `packages/util/src/observability.ts` — tracing/metrics support
- `packages/util/src/global-roots.workerd.ts` — workerd variant (platform conditional)

## Public API / Key Types
- `effect/app-node` — `LayerNode.Provider`, `LayerNode.Output`, `makeLocationNode`, `makeGlobalNode`; the primitives Core uses to declare services
- `effect/layer-node` — `LayerNode.group`, `LayerNode.Replacements`, `LayerNode.unbound`
- Path/encode/hash/flock/retry helpers used by Core and Server
- `fs-util` — `FSUtil.Interface extends` the catalog `effect` `FileSystem`, so `readDirectoryEntries` and `FileSystem.DirectoryEntry` are inherited, not redeclared
- Platform-conditional modules resolved via `#` imports in consuming packages

## Dependencies
- In: `effect` (external).
- Out: `core`, `server`, `client`, `plugin`, `tui`, `app`, `session-ui`, `sdk`.

## Links
- Parent: INDEX.md
