# Desktop & Hosted Surfaces

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Native and hosted deployables around the shared UI: the Electron desktop app, the enterprise SolidStart app, the hosted stats application, and their infrastructure. Owns packaging/hosting glue; they reuse `app`/`session-ui`/`ui` and the client runtime. The old `packages/console` and `packages/gui-extensions` trees were deleted upstream (only ignored build leftovers remain on disk).

## Key Paths
- `packages/desktop/src/` — Electron `main/`, `preload/`, `renderer/`, `shared/`; browser panes (`browser-chromium.ts`, `browser-pane.ts`, `cdp.ts`), IPC (`ipc.ts`, `ipc-transport.ts`), diagnostics/lighthouse/profiling; entry `src/desktop.ts`, `src/index.ts` (main: `./out/main/index.js`)
- `packages/desktop/script/` — `dev.ts`, `dev-electron.ts`, `build.ts`, `pack.ts`, `migration.ts`, `copy-icons.ts`, `verify-bundles.ts`, `fixtures/`; `electron-vite build`, `electron-builder` packaging (the old `scripts/` dir is an empty leftover; bench scripts moved to `perf/`)
- `packages/desktop/electron-builder.config.ts` — CloseCode identity on upstream's wholesale packaging config: `productName`/protocol `name` CloseCode, GitHub `publish` `reubenzhuyt-cloud/CloseCode`, mac signing/notarize moved out of electron-builder into post-build `.github/release/*.sh`, prod linux executable `ai.opencode` (`linuxExecutableName`); identity asserted by `electron-builder.config.test.ts`
- `packages/desktop/src/main/service/background-service.ts` — upstream `prepare()`/`setup.client` structure; the local-channel registration stays the isolated `closecode-service-local.json` (matches `ServiceConfig.filename("local")` in `packages/cli/src/services/service-config.ts`)
- `packages/desktop/perf/startup.bench.ts` — startup benchmark driven by strobe (README); the dev launch stops `<home>/desktop/opencode/closecode-service-local.json`, warm waits on `<home>/.local/state/opencode/closecode-service.json`
- `packages/enterprise/` — SolidStart app (`src/app.tsx`, `entry-client.tsx`, `entry-server.tsx`, `src/routes/` incl. `api/` and `share/`)
- `packages/stats/` — hosted stats workspaces: `app/`, `core/`, `server/`
- `infra/` — SST infra (`app.ts`, `stage.ts`, `stats.ts`, `webapp.ts`)
- `services/` — deployed services: `site`, `files`, `share`, `update`

## Public API / Key Types
- Desktop entry (`src/index.ts`), IPC event/transport modules
- `infra/*.ts` SST stacks: `sst.config.ts` at repo root

## Dependencies
- In: `app`, `session-ui`, `ui`, `client`, `util`, `plugin-browser` (desktop browser).
- Out: deployment targets (`infra`).

## Links
- Parent: INDEX.md
