# Util (`@opencode/util`)

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Cross-cutting helpers shared across the monorepo plus the Effect node/layer infrastructure that Core builds its service graph on. Owns no domain concepts. Leaf-ish: depends mostly on `effect` and Node/Bun builtins.

## Key Paths
- `packages/util/src/` — flat one-file utilities (~40: `path`, `hash`, `glob`, `flock`, `fs-util`, `process`, `npm`, `npm-config`, `patch`, `retry`, `encode`, `binary`, `bom`, `qr`, `uuid`, `open`, `duration`, `record`, `teardown`, `session-title-fallback`, `session-turn`, …; `*.test.ts` siblings colocated)
- `packages/util/src/effect/` — `app-node` graph helpers (`makeLocationNode`, `makeGlobalNode`, node providers/consumers), runtime helpers
- `packages/util/src/observability/` — tracing/metrics support
- `packages/util/src/runtime/`
- `packages/util/src/global-roots.workerd.ts` — workerd variant (platform conditional)

## Public API / Key Types
- `effect/app-node` — `LayerNode.Provider`, `LayerNode.Output`, `makeLocationNode`, `makeGlobalNode`; the primitives Core uses to declare services
- Path/encode/hash/flock/retry helpers used by Core and Server
- `fs-util` — `FSUtil.Interface extends` the catalog `effect` `FileSystem` (`fs-util.ts:33`), so `readDirectoryEntries` and the `FileSystem.DirectoryEntry` types are inherited, not redeclared (the fork's duplicate `DirEntry`/`readDirectoryEntries` was removed in the v2.2.6 merge)
- Platform-conditional modules resolved via `#` imports in consuming packages

## Dependencies
- In: `effect` (external).
- Out: `core`, `server`, `client`, `plugin`, `tui`, `app`, `session-ui`, `sdk`.

## Links
- Parent: INDEX.md
