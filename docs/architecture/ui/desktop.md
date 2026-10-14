# Desktop & Hosted Surfaces

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Native and hosted deployables around the shared UI: the Electron desktop app, the enterprise SolidStart app, the hosted console/stats applications, and their infrastructure. Owns packaging/hosting glue; they reuse `app`/`session-ui`/`ui` and the client runtime.

## Key Paths
- `packages/desktop/src/` — Electron `main/`, `preload/`, `renderer/`, `shared/`; browser panes (`browser-chromium.ts`, `browser-pane.ts`, `cdp.ts`), IPC (`ipc.ts`, `ipc-transport.ts`), diagnostics/lighthouse/profiling; entry `src/desktop.ts`, `src/index.ts` (main: `./out/main/index.js`)
- `packages/desktop/scripts/` — `dev.ts`, `prebuild.ts`, `migration.ts`; `electron-vite build`, `electron-builder` packaging
- `packages/enterprise/` — SolidStart app (`src/app.tsx`, `entry-client.tsx`, `entry-server.tsx`, `src/routes/` incl. `api/` and `share/`)
- `packages/console/` — hosted console workspaces: `app/`, `core/`, `function/`, `mail/`, `resource/`, `support/` (no root package.json)
- `packages/stats/` — hosted stats workspaces: `app/`, `core/`, `server/`
- `infra/` — SST infra per surface (`app.ts`, `console.ts`, `enterprise.ts`, `stats.ts`, `webapp.ts`, `lake.ts`, `monitoring.ts`, `secret.ts`, `stage.ts`)
- `services/` — deployed services: `www`, `files`, `update`

## Public API / Key Types
- Desktop entry (`src/index.ts`), IPC event/transport modules
- `infra/*.ts` SST stacks: `sst.config.ts` at repo root

## Dependencies
- In: `app`, `session-ui`, `ui`, `client`, `util`, `plugin-browser` (desktop browser).
- Out: deployment targets (`infra`).

## Links
- Parent: INDEX.md
