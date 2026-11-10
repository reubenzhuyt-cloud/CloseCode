# CLI (`@opencode/cli`)

> last-verified: 742785d1eb @ 2026-11-10

## Responsibility
The `closecode`/`opencode` binary: parses commands, runs the TUI, hosts the server and ACP integration, manages services/updates, and provides non-interactive run modes. Owns process entry and wiring; it does not own UI rendering (tui) or server behavior (server).

## Key Paths
- `packages/cli/src/index.ts` — binary entry (`NodeRuntime`, `Runtime`, observability, updater)
- `packages/cli/src/commands/commands.ts` — command definitions
- `packages/cli/src/framework/` — `runtime.ts`, `spec.ts` (command framework)
- `packages/cli/src/run/` — `run.ts`, `noninteractive.ts`, `ui.ts`
- `packages/cli/src/services/` — `server-connection.ts`, `service-config.ts`, `service-registration.ts`, `standalone.ts`, `updater.ts`, `update-preflight.tsx`, `updater-action.ts`, `web-ui.ts`, `retained-image.ts`, `plugin-startup.ts` (one-shot plugin wait), `port-owner.ts`, `remote-tunnel.ts`
- `packages/cli/src/services/service-config.ts` — background-service registration: `filename(channel)` → `closecode-service[-<channel>].json` (isolated from upstream's `opencode-service*`), `channelPort`, `legacyRegistrationFilenames` migration; `test/service-lifecycle.test.ts` asserts homes come from `ServiceConfig.filename()` and that the fork never adopts upstream `service*.json` registration names
- `packages/cli/src/server-process.ts` — spawns/attaches to the background server; `PortOwner.describe` in the bind-conflict message, `ServiceConfig.processEnv` injection
- `packages/cli/src/services/updater.ts` — **no update backend**: the fork publishes no update metadata, so `latest()` always fails `noUpdateBackend()` (`updater.ts:291`), `upgrade()` (`:350`) allows only an explicit `--method curl` against the fork installer (`raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install`, `:372`), and `check()` (`:466`) returns `unavailable` (source-checkout builds get their own message, `:467-471`) instead of resolving an upstream version; `release()`/`wingetVersion()` (opencode.ai/brew.sh lookups) are deleted. The `methods` list (`:14`) survives only for install-`method()` detection (`curlBinaries` realpath → `curl`, `wingetPackage` → WinGet, `installedFormula` → Homebrew, npm-scope regex `:169`) and `uninstall` (matching package-manager removal); automatic checks (`inspect`/`run`) stay off by default (`OPENCODE_DISABLE_AUTOUPDATE`, failure logs `update check failed`)
- `packages/cli/script/pack.ts` — `packDistribution` builds the `closecode` / `closecode-node` distributions; replaces the old `script/publish*.ts` scripts (run from root `bun run pack`)
- `packages/cli/src/mini.ts`, `mini-host.ts` — mini (prompt-only) host using `@opencode/tui/mini`
- `packages/cli/src/session-target.ts` — resolves `--session [model]` targets
- `packages/cli/src/acp/` — Agent Client Protocol integration (`agent`, `connection`, `tool`, `permission`, …)
- `packages/cli/src/node/` — node plugin runtime (`plugin-runtime.effect`, `plugin-runtime.promise`)
- `packages/cli/src/ui/` — `prompt.ts`, `timeline.tsx`

## Public API / Key Types
- `runMini`, `createMiniConnection`, `resolveMiniTarget`, `validateMiniTerminal`
- `ServerProcess`, `SessionTarget`, `SessionTargetPreparation`

## Notes
- `bun run dev` runs this package; `bun run dev:live` connects to the elected background server (AGENTS.md).

## Dependencies
- In: `client`, `server`, `tui`, `plugin`, `util`, `@opencode-ai/pty`.
- Out: top-level binary (nothing depends on `cli`).

## Links
- Parent: INDEX.md
