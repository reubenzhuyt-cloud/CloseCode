# App (`@opencode/app`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
The SolidStart web/desktop application: session composer, home, new-session flow, providers, servers/pairing, settings, shell, workspaces, and the components lab. Owns web UI composition; renders shared `@opencode/session-ui` and `@opencode/ui` components and talks to the server via `@opencode/client`.

## Key Paths
- `packages/app/src/index.ts` — `AppBaseProviders`, `AppInterface`, `preloadRoute`, `PlatformProvider`, `ServerConnection`
- `packages/app/src/app.tsx`, `entry.tsx`, `desktop.ts`
- `packages/app/src/runtime/` — `platform/` (polyfills, `base-path`, drag-out), `i18n/` (per-locale dictionaries), `persistence/`, `plugin/` (app links), `server/` (server registry)
- `packages/app/src/new-session/`, `session/`, `home/` — core flows (`route.tsx`, `screen.tsx`, `controller.ts`); `new-session/workspace/checkout-machine.ts` drives workspace checkout
- `packages/app/src/composer/`, `settings/`, `providers/`, `servers/`, `shell/`, `workspaces/`, `usage/`, `voice/`, `tips/`
- `packages/app/src/components-lab/` — focus/inspector stories used by component tests
- `packages/app/src/theme-preload.test.ts`

## Public API / Key Types
- `AppInterface`, `AppBaseProviders`, `PlatformProvider`, `Platform`, `ServerConnection`
- Run: `bun run --cwd packages/app dev` (web), `bun --cwd packages/desktop dev` (desktop)

## Dependencies
- In: `client`, `schema`, `gui-plugins`, `plugin`, `session-ui`, `ui`, `util`.
- Out: `desktop` (Electron renderer); hosted surfaces live in `packages/data` and `services/` (see platform/tooling-services.md).

## Links
- Parent: INDEX.md
