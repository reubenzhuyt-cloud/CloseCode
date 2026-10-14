# Core / Filesystem

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns file access, mutation, watching, and content search scoped to a Location, plus formatting and ripgrep. Does not own git/VCS (location-workspaces.md) nor the model-facing file tools (tools.md wires them to this service).

## Key Paths
- `packages/core/src/filesystem.ts` — `FileSystem` service
- `packages/core/src/filesystem/` — `fff.{ts,bun,node,workerd}.ts` (fast file finder), `ignore.ts`, `protected.ts`, `search.ts`, `watcher.ts`, `watcher-binding.ts`, `location-watcher.ts`, `location-watcher-policy.ts`
- `packages/core/src/file.ts`, `file-access.ts`, `file-mutation.ts`, `file-retention.ts`, `mime.ts` — file I/O and retention
- `packages/core/src/ripgrep/` — bundled ripgrep binary resolution
- `packages/core/src/formatter.ts`, `formatter/builtins.ts` — code formatting
- `packages/schema/src/filesystem.ts`, `filesystem-v1.ts`, `file-diff.ts` — filesystem/wire shapes

## Public API / Key Types
- `FileSystem` service (`@opencode/FileSystem`) with read/write/search/watch operations
- Platform-conditional `#fff` import (`fff.bun|node|workerd`) and `#ripgrep` binary selection
- `FileDiff` schema for presenting changes

## Dependencies
- In: `schema/filesystem`, util (path/glob/hash), platform `#fff` conditions.
- Out: tools (read/write/edit/grep/glob), session (snapshots), server (`fs` route).

## Links
- Parent: INDEX.md
