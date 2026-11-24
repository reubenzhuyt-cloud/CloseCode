# CLI (`@opencode/cli`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
The `closecode`/`opencode` binary: parses commands, runs the TUI, hosts the server and ACP integration, manages services/updates/machines, and provides non-interactive run modes. Owns process entry and wiring; it does not own UI rendering (tui) or server behavior (server). The Rust `opencode-native` CLI (`packages/cli-rs`) is a second front end held to this one by parity suites.

## Key Paths
- `packages/cli/src/index.ts` — binary entry (`NodeRuntime`, `Runtime`, observability, updater)
- `packages/cli/src/commands/commands.ts` — command definitions; root name falls back to `closecode` (`:72`), `parseServerURL`-backed `serverURLFlag`, shared `LoginParams`, hidden root `login` alias, and the `machine add|list|remove` group (`:567`)
- `packages/cli/src/framework/` — `runtime.ts`, `spec.ts` (command framework)
- `packages/cli/src/run/` — `run.ts`, `noninteractive.ts`, `ui.ts`
- `packages/cli/src/services/` — `server-connection.ts`, `service-config.ts`, `service-registration.ts`, `standalone.ts`, `updater.ts`, `update-preflight.tsx`, `updater-action.ts`, `web-ui.ts`, `retained-image.ts`, `plugin-startup.ts` (one-shot plugin wait), `port-owner.ts`, `remote-tunnel.ts`
- `packages/cli/src/services/service-config.ts` — background-service registration: `filename(channel)` → `closecode-service[-<channel>].json`, `channelPort` (`0xc0e0`/`0xc0e1`, win32 remap), `legacyRegistrationFilenames` migration; `test/service-lifecycle.test.ts` asserts the fork never adopts upstream `service*.json` names
- `packages/cli/src/server-process.ts` — spawns/attaches to the background server; `PortOwner.describe` in the bind-conflict message, `ServiceConfig.processEnv` injection
- `packages/cli/src/services/updater.ts` — **no update backend**: `latest()` always fails `noUpdateBackend()` (`:328`), `upgrade()` (`:406`) allows only `method === "curl"` against the fork installer (`raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install`, `:428`, `:433`), and `check()` (`:525`) returns `unavailable`. Upstream's `release()`/`wingetVersion()` lookups and the per-manager install-command table are deleted. It keeps upstream's Volta/mise `installedOwner` detection, npm-prefix resolution, and `managed()`/`managedError()` (rebranded `CloseCode is managed by <owner>`); `inspect()` keeps automatic checks off by default (`:465`)
- `packages/cli/script/pack.ts` — `packDistribution` builds the `closecode` / `closecode-node` distributions (run from root `bun run pack`)
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
- `machine` was added for the machine link; it registers no service of its own, and `login` is also an `auth login` alias.

## Dependencies
- In: `client`, `server`, `tui`, `plugin`, `util`, `@opencode-ai/pty`.
- Out: top-level binary (nothing depends on `cli`).

## Links
- Parent: INDEX.md
