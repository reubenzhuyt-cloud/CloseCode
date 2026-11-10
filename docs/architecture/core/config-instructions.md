# Core / Config & Instructions

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns configuration discovery, normalization, watching, and the instructions algebra/built-ins. Does not own the config *schema* (in `@opencode/schema/config`) nor Session-scoped instruction state (see session/compaction-instructions.md).

## Key Paths
- `packages/core/src/config.ts` — `Config.Service` (`@opencode/Config`), `Config.Options`, `latest(entries, key)`, `testLayer`; `Config.Interface` carries `updateAgent?` (`config.ts:59`) and `integration?` (`config.ts:65`), both implemented
- `packages/core/src/config/` — `discovery.ts`, `markdown.ts`, `normalize.ts`, `variable.ts`, `watch.ts`; `plugin/auto-approve.ts` (`permission.evaluate` hook: `ask`→`allow` only when `auto_approve === true`, registered before `ConfigPolicyPlugin` in `plugin/internal.ts` so policy deny wins)
- `packages/core/src/instructions/` — `builtins.ts`, `index.ts`; the Instructions algebra and built-ins live in `src/instructions`
- `packages/core/src/instruction-discovery.ts` — ambient global/upward-project instruction discovery
- `packages/schema/src/config.ts`, `packages/schema/src/config/` — config shapes (`agent`, `command`, `compaction`, `experimental`, `flag`, `formatter`, `lsp`, `mcp`, `media`, `model`, `plugin`, `policy`, `provider`, `reference`, `shell`, `tool-output`, `warming`, `watcher`, `websearch`, `worktree`)
- `packages/core/src/skill/`, `reference/instructions.ts` — skill/reference instruction producers

## Public API / Key Types
- `Config.Service`, `Config.Interface`, `Config.Options`, `Config.latest`
- `Config.Info.skills` — `SkillEntry[]` = `string | {path, agents?, tags?}` (`schema/config.ts`); `normalizeSkills` (`config/normalize.ts:233`) decodes array entries via `SkillEntry` and still flattens the legacy `{paths, urls}` object form to strings
- Discovery plugins (`config/plugin/skill.ts`, `plugin/compatibility.ts`) scan through the shared `SkillScan.scan` (`config/plugin/skill-scan.ts`; compatibility also adds upstream `compatibility()` roots) and hand `editor.add` a flat discovered list — no per-ID dedup — so `Skill.Service` applies origin precedence to disk-vs-disk collisions (`origin` = `project` vs `global` by `Location.directory` containment); duplicate-source-path `agents`/`tags` merging is per source path, not per skill ID
- `ConfigDiscovery` walks upward from `Location.directory` to the drive root (`config/discovery.ts:36`) unless the location is already the global root, so host-level `.claude`/`.agents`/`.opencode` roots at every ancestor are candidate config roots
- `Config.Info.auto_approve` (optional `boolean`, default `false`) — server-side ask→allow for all sessions in the Location; never overrides rule/`deny` (see `plugin/auto-approve.ts`)
- `Config.Info.policies` (optional `ConfigPolicy[]`, `schema/config.ts:82`) — ordered access policies for providers/tools/integrations enforced by `ConfigPolicyPlugin` (`plugin/internal.ts:306`)
- Feature flags: `Flag` service (`packages/core/src/flag.ts`; `Flag.enabled(key)` at `:116`) resolves schema `config/flag.ts` keys — `OPENCODE_FLAGS` env (`-key`, `all`) > `experimental.<key>`/`all_flags` from config > default, where flags are on only for `local`/`dev` channels and off in releases (`flag.ts:35`)
- Instruction producers keep their observed domain; the runner composes built-ins, discovery, guidance, and entries in `loadInstructions` (no instruction registry) — AGENTS.md "V2 Session Core"
- Runtime config path resolution honors `#`-import platform conditions where needed

## Dependencies
- In: `schema/config`, `schema/instruction`, config discovery, workspace/project.
- Out: session, plugin, server (`config` route), CLI.

## Links
- Parent: INDEX.md
