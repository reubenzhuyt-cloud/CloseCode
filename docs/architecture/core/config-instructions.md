# Core / Config & Instructions

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns configuration discovery, normalization, watching, feature-flag resolution, and the instructions algebra/built-ins. Does not own the config *schema* (in `@opencode/schema/config`) nor Session-scoped instruction state (see session/compaction-instructions.md).

## Key Paths
- `packages/core/src/config.ts` — `Config.Service` (`@opencode/Config`), `Config.Options`, `latest(entries, key)`, `testLayer`; `Config.Interface` carries `updateAgent?` (`config.ts:61`) and `integration?` (`:67`), both implemented; `project_overlay` is resolved here without the Flag service (which reads Config) at `:404-407`
- `packages/core/src/config/` — `discovery.ts`, `markdown.ts`, `normalize.ts`, `variable.ts`, `watch.ts`, `integration.ts`, `managed.ts`
- `packages/core/src/config/plugin/` — config plugins: `agent`, `auto-approve`, `command`, `compaction`, `compatibility`, `entry-observer`, `formatter`, `image`, `instruction`, `location-watcher`, `mcp`, `policy`, `provider`, `reference`, `session-search`, `shell`, `skill`, `skill-file`, `skill-scan`, `snapshot`, `source`, `tool-output`, `websearch`, `worktree`
- `packages/core/src/instructions/` — `builtins.ts`, `index.ts`, `agent.ts`; the Instructions algebra and built-ins live in `src/instructions`
- `packages/core/src/instruction-discovery.ts` — ambient global/upward-project instruction discovery
- `packages/core/src/flag.ts`, `flag/resolve.ts` — `Flag.Service` (`resolve`, `all`, `enabled`), `Flag.Overrides`, `testLayer`
- `packages/schema/src/config.ts`, `packages/schema/src/config/` — config shapes (`agent`, `command`, `compaction`, `experimental`, `flag`, `lsp`, `mcp`, `media`, `model`, `plugin`, `policy`, `provider`, `reference`, `shell`, `tool-output`, `warming`, `watcher`, `websearch`, `worktree`)
- `packages/core/src/skill/`, `reference/instructions.ts` — skill/reference instruction producers

## Public API / Key Types
- `Config.Service`, `Config.Interface`, `Config.Options`, `Config.latest`
- `Config.Info.skills` — `SkillEntry[]` = `string | {path, agents?, tags?}` (`schema/config.ts`); `normalizeSkills` decodes array entries via `SkillEntry` and still flattens the legacy `{paths, urls}` object form to strings
- Discovery plugins (`config/plugin/skill.ts`, `plugin/compatibility.ts`) scan through the shared `SkillScan.scan` (`config/plugin/skill-scan.ts`) and hand `editor.add` a flat discovered list — no per-ID dedup — so `Skill.Service` applies origin precedence to disk-vs-disk collisions; duplicate-source-path `agents`/`tags` merging is per source path, not per skill ID
- `ConfigDiscovery` walks upward from `Location.directory` (`config/discovery.ts:89-92`, `fs.up` unless the location is already a global root) and probes `.claude`, `.agents`, `.opencode`, `opencode.json[c]` at each ancestor, so host-level roots are candidate config roots
- `ConfigDiscovery.overlay` (`config/discovery.ts:61`) reads the personal per-project dir `~/.config/opencode/project/<project-id>/` when the `project_overlay` flag is on, layered above the repo's own `.opencode`; home memory keeps the skills it builds there
- `Config.Info.auto_approve` — server-side ask→allow for all sessions in the Location; never overrides rule/`deny` (see `plugin/auto-approve.ts`, registered before `ConfigPolicyPlugin`)
- `Config.Info.policies` (optional `ConfigPolicy[]`) — ordered access policies for providers/tools/integrations enforced by `ConfigPolicyPlugin` (`plugin/internal.ts:336`); `experimental.policies` is deprecated in favour of the top-level key
- `Config.Info.automations` — `boolean` (default true) switching scheduled/event-driven runs on (see automation.md)
- Feature flags: `Flag.enabled(key)` resolves `schema/config/flag.ts` keys — `OPENCODE_FLAGS` env (`-key`, `all`) > `experimental.<key>`/`all_flags` from config > default, on in `local`/`dev` channels and off in releases. Registry keys: `todo`, `media_blob`, `artifacts`, `console_watches`, `recommended_api`, `model_speeds`, `full_codemode`, `machines`, `home_memory`, `project_overlay`, `opencode_api`, `sqlite_fts`
  - `optInOnly = {todo, opencode_api}` — never on by default; `OPENCODE_FLAGS=all` and `experimental.all_flags` skip them
  - `localOnly = {opencode_api}` — off outside local/dev builds whatever the config says
- Instruction producers keep their observed domain; the runner composes built-ins, discovery, guidance, and entries in `loadInstructions` (no instruction registry) — AGENTS.md "Session Core"

## Dependencies
- In: `schema/config`, `schema/instruction`, config discovery, workspace/project.
- Out: session, plugin, server (`config` route), CLI.

## Links
- Parent: INDEX.md
