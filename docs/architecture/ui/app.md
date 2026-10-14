# App (`@opencode/app`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
The SolidStart web/desktop application: session composer, home, new-session flow, providers, servers/pairing, settings, shell, and workspaces. Owns web UI composition; renders shared `@opencode/session-ui` and `@opencode/ui` components and talks to the server via `@opencode/client`.

## Key Paths
- `packages/app/src/index.ts` — `AppBaseProviders`, `AppInterface`, `preloadRoute`, `PlatformProvider`, `ServerConnection`
- `packages/app/src/app.tsx`, `entry.tsx`, `desktop.ts`
- `packages/app/src/runtime/` — platform polyfills, i18n locales, server registry (`runtime/server/registry`)
- `packages/app/src/new-session/`, `session/`, `home/` — core flows (`route.tsx`, `screen.tsx`, `controller.ts`)
- `packages/app/src/composer/`, `settings/`, `providers/`, `servers/`, `shell/`, `workspaces/`
- `packages/app/src/theme-preload.test.ts`

## Public API / Key Types
- `AppInterface`, `AppBaseProviders`, `PlatformProvider`, `Platform`, `ServerConnection`
- Run: `bun run --cwd packages/app dev` (web), `bun --cwd packages/desktop dev` (desktop)

## Dependencies
- In: `client`, `schema`, `plugin-browser`, `session-ui`, `ui`, `util`.
- Out: `desktop` (Electron renderer), `enterprise`.

## Links
- Parent: INDEX.md
