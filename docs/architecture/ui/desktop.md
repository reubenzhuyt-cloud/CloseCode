# Desktop

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
The Electron desktop app around the shared UI: main/preload/renderer processes, browser panes, IPC, service lifecycle, and packaging. Owns packaging/hosting glue; it reuses `app`/`ui`/`gui-plugins` and the client runtime. `packages/console`, `packages/gui-extensions`, `packages/enterprise` and `packages/stats` are all gone (only ignored build leftovers remain on disk); stats lives in `packages/data` and the hosted apps in `services/` (see platform/tooling-services.md).

## Key Paths
- `packages/desktop/src/` — Electron `main/`, `preload/`, `renderer/`, `shared/`; browser panes (`browser-chromium.ts`, `browser-pane.ts`, `cdp.ts`), IPC (`ipc.ts`, `ipc-machine.ts`, `ipc-transport.ts`), diagnostics/lighthouse/profiling; entry `src/desktop.ts`, `src/index.ts` (main: `./out/main/index.js`)
- `packages/desktop/src/main/identity.ts` — `resolveIdentity(channel, packaged)`, `isCollidingDevShortcut`; the branding tables (`APP_NAME`, `APP_ID`, `APP_USER_MODEL_ID`) live here, and `constants.ts` re-exports them
- `packages/desktop/script/` — `dev.ts`, `dev-electron.ts`, `build.ts`, `pack.ts`, `migration.ts`, `copy-icons.ts`, `copy-metainfo.ts`, `picker.ts`, `preview-binding.ts`, `verify-bundles.ts`, `fixtures/`; `electron-vite build`, `electron-builder` packaging
- `packages/desktop/electron-builder.config.ts` — CloseCode identity on upstream's wholesale packaging config: `productName`/protocol `name` CloseCode, GitHub `publish` `reubenzhuyt-cloud/CloseCode`, mac signing/notarize moved out of electron-builder into post-build `.github/release/*.sh`, prod linux executable `ai.opencode` (`linuxExecutableName`); identity asserted by `electron-builder.config.test.ts`
- `packages/desktop/src/main/service/background-service.ts` — upstream `prepare()`/`setup.client` structure; the local-channel registration stays the isolated `closecode-service-local.json` (matches `ServiceConfig.filename("local")` in `packages/cli/src/services/service-config.ts`)
- `packages/desktop/perf/startup.bench.ts` — startup benchmark driven by strobe (README); the dev launch stops `<home>/desktop/opencode/closecode-service-local.json`, warm waits on `<home>/.local/state/opencode/closecode-service.json`
- `packages/gui-plugins/` — `@opencode/gui-plugins`, the built-in app/desktop GUI plugins (`src/main.ts` composes `browser`, `context`, `details`, `file`, `goal`, `microsoft-office`, `pairing`, `review`, `sources`, `ssh`, `terminal`, `updater`, `wsl`, `btw`, `debug`), consumed by both `app` and `desktop`

## Public API / Key Types
- Desktop entry (`src/index.ts`), IPC event/transport modules, `resolveIdentity`
- Hosted surfaces now live outside this tree: `packages/data/{app,core,server}` (stats) and `services/{site,files,data,legacy,update}` — see platform/tooling-services.md

## Dependencies
- In: `app`, `gui-plugins`, `client`, `schema`, `ui`, `plugin`, `util` (dev), `plugin-browser` transitively through `gui-plugins`.
- Out: deployment targets (`services/*`, release CI).

## Links
- Parent: INDEX.md
