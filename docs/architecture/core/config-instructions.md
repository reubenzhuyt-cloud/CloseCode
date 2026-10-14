# Core / Config & Instructions

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns configuration discovery, normalization, watching, and the instructions algebra/built-ins. Does not own the config *schema* (in `@opencode/schema/config`) nor Session-scoped instruction state (see session/compaction-instructions.md).

## Key Paths
- `packages/core/src/config.ts` — `Config.Service` (`@opencode/Config`), `Config.Options`, `latest(entries, key)`, `testLayer`
- `packages/core/src/config/` — `discovery.ts`, `markdown.ts`, `normalize.ts`, `variable.ts`, `watch.ts`
- `packages/core/src/instructions/` — `builtins.ts`, `index.ts`; the Instructions algebra and built-ins live in `src/instructions`
- `packages/core/src/instruction-discovery.ts` — ambient global/upward-project instruction discovery
- `packages/schema/src/config.ts`, `packages/schema/src/config/` — config shapes (`agent`, `command`, `compaction`, `experimental`, `formatter`, `lsp`, `mcp`, `media`, `model`, `plugin`, `policy`, `provider`, `reference`, `shell`, `tool-output`, `warming`, `watcher`, `websearch`, `worktree`)
- `packages/core/src/skill/`, `reference/instructions.ts` — skill/reference instruction producers

## Public API / Key Types
- `Config.Service`, `Config.Interface`, `Config.Options`, `Config.latest`
- Instruction producers keep their observed domain; the runner composes built-ins, discovery, guidance, and entries in `loadInstructions` (no instruction registry) — AGENTS.md "V2 Session Core"
- Runtime config path resolution honors `#`-import platform conditions where needed

## Dependencies
- In: `schema/config`, `schema/instruction`, config discovery, workspace/project.
- Out: session, plugin, server (`config` route), CLI.

## Links
- Parent: INDEX.md
