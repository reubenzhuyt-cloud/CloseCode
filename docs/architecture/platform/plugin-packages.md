# Plugin Packages (`@opencode/plugin`, `@opencode/plugin-browser`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
`@opencode/plugin` is the plugin authoring/host SDK: plugin sources, lifecycle, storage, and the effect/promise/tui/gui author APIs. `@opencode/plugin-browser` is the desktop browser plugin (connection, proxy, tunnel, tools). Owns the plugin-facing surface; Core owns the in-process host internals (core/plugin-system.md).

## Key Paths
### `@opencode/plugin`
- `packages/plugin/src/` — `host.ts`, `source.ts`, `source.{bun,node,package}.ts`, `storage.ts`, `worktree.ts`, `app.ts`, `options.ts`, `rpc.ts`, `permission.ts`, `runtime.ts`, `runtime-modules.ts`
- `packages/plugin/src/effect/` — Effect plugin API (`agent`, `command`, `event`, `integration`, `mcp`, `model`, `permission`, `plugin`, `provider`, `reference`, `registration`, `session`, `shell`, `skill`, `storage`, `tool`, `vcs`, `websearch`, `worktree`, `rpc`, …)
- `packages/plugin/src/promise/` — async/await equivalent of the Effect API (`hook`, `reload`)
- `packages/plugin/src/tui/` — TUI plugin API (`context.ts`, `plugin.ts`, `solid.ts`)
- `packages/plugin/src/gui/` — GUI plugin API for the app/desktop: `host.ts`, `host-apis.ts`, `plugin.ts`, `registries.ts`, `declarations.ts`, `main.ts`, `review.ts`, `browser.ts`, `file.ts`, `updater.ts`, `vite.ts`, `solid.ts`, `scope.ts`
- Exports: `.`, `./effect`, `./host`, `./runtime`, `./tui`, `./gui`, `./gui/*`, `./*`

### `@opencode/plugin-browser`
- `packages/plugin-browser/src/` — `index.ts`, `connection.ts`, `proxy.ts`, `proxy-machine.ts`, `tunnel.ts`, `tunnel-machine.ts`, `tools.ts`, `skill.ts`, `rpc.ts`, `files.ts`, `preview-path.ts`, `wildcard.ts`, `workspace.ts`, `machine.ts`

## Public API / Key Types
- `@opencode/plugin` `host`, `source`, effect/promise `plugin` registration; `Plugin.hook`/`Plugin.reload`
- effect/promise `skill` domain: `SkillDomain = Pick<SkillApi, "list">` (+ `transform`, `reload`); `SkillEditor.add(skill, registration?)` takes an optional `Skill.Registration` — 1-arg calls default to `source: "plugin"`
- `@opencode/plugin/gui/host` — GUI plugin composition; `@opencode/gui-plugins` composes the built-ins (see ui/desktop.md)
- `@opencode/plugin-browser` tool + connection surface consumed by `gui-plugins` (`browser` plugin) for app/desktop

## Dependencies
- In: `schema`, `client`, `protocol`, `ai`, `util`.
- Out: `core` (plugin host loads plugin sources), `tui`, `app`, `desktop` (via `gui-plugins`), `sdk`, `cli`.

## Links
- Parent: INDEX.md
