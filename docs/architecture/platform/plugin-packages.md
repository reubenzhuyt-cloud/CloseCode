# Plugin Packages (`@opencode/plugin`, `@opencode/plugin-browser`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
`@opencode/plugin` is the plugin authoring/host SDK: plugin sources, lifecycle, storage, and the effect/promise/tui author APIs. `@opencode/plugin-browser` is the desktop browser plugin (connection, proxy, tunnel, tools). Owns the plugin-facing surface; Core owns the in-process host internals (core/plugin-system.md).

## Key Paths
### `@opencode/plugin`
- `packages/plugin/src/` — `host.ts`, `source.ts`, `source.{bun,node,package}.ts`, `storage.ts`, `worktree.ts`, `app.ts`, `options.ts`, `rpc.ts`
- `packages/plugin/src/effect/` — Effect plugin API (`agent`, `command`, `event`, `mcp`, `model`, `permission`, `plugin`, `provider`, `reference`, `registration`, `session`, `shell`, `skill`, `storage`, `tool`, `vcs`, `websearch`, `worktree`, `rpc`, …)
- `packages/plugin/src/promise/` — async/await equivalent of the Effect API (`hook`, `reload`)
- `packages/plugin/src/tui/` — TUI plugin API (`context.ts`, `plugin.ts`, `solid.ts`)
- Exports: `.`, `./effect`, `./host`, `./tui`, `./*`

### `@opencode/plugin-browser`
- `packages/plugin-browser/src/` — `index.ts`, `connection.ts`, `proxy.ts`, `tunnel.ts`, `tools.ts`, `rpc.ts`, `files.ts`

## Public API / Key Types
- `@opencode/plugin` `host`, `source`, effect/promise `plugin` registration; `Plugin.hook`/`Plugin.reload`
- `@opencode/plugin-browser` tool + connection surface consumed by `app`/`desktop`

## Dependencies
- In: `schema`, `client`, `protocol`, `ai`, `util`.
- Out: `core` (plugin host loads plugin sources), `tui`, `app`, `sdk`, `cli`.

## Links
- Parent: INDEX.md
