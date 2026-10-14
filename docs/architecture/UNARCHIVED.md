# Unarchived architecture deltas

Staged notes awaiting archivist merge. Newest first.

## 2026-10-14 — bundle `@opencode/ai/providers/anthropic-compatible`, harden `Provider.loadPackage`; release 0.3.0

Source: compiled standalone `closecode` exe could not load a provider configured as `package: "@opencode/ai/providers/anthropic-compatible"`; it fell into a variable dynamic `import()` that fails with `Cannot find package '@opencode/ai' imported from B:\~BUN\root\chunk-*.js`.

- `packages/core/src/provider.ts` — `Provider.loadPackage`: the static `builtins` import table already lists `@opencode/ai/providers/anthropic-compatible` (added upstream by `a19285d10d`, included by the v2 merge; the 0.2.6 release predates it, which is the root cause). Added a guard so any `@opencode/ai/` specifier not in `builtins` fails with `LoadError` instead of reaching `importModule`'s variable dynamic import, and removed the now-unreachable `@opencode/ai/` pass-through in the `import.meta.resolve` block. No other behaviour changed.
- Version bump 0.2.6 → 0.3.0 over the fork release file set (mirrors `89ee76a978`): root `package.json`, `packages/{app,cli,client,core,desktop,plugin,sdk,server,session-ui,tui,ui}/package.json`, plus the 11 workspace entries in `bun.lock`. `OPENCODE_VERSION` is injected at build time from `Script.version`; there is no source version constant.

Verification: `packages/cli` `bun run script/build.ts --single --skip-install --skip-web-ui` (`OPENCODE_VERSION=0.3.0`) produced `dist/cli-windows-x64/bin/closecode.exe` = `closecode v0.3.0`. Differential run with an isolated config (`providers.acme.package = @opencode/ai/providers/anthropic-compatible`, `baseURL http://127.0.0.1:1`): installed 0.2.6 → `Cannot initialize acme/claude-test: Cannot find package '@opencode/ai' imported from B:\~BUN\root\chunk-kbtmpcxv.js`; new 0.3.0 → adapter loads and the request fails only with `ConnectionRefused`.

## 2026-10-14 — resolve `upstream-v2` merge conflicts (branding + upstream adoption)

Source: in-progress merge of `upstream-v2` (origin/v2, 575 commits) into `dev`. Conflict markers resolved in the files below while keeping CloseCode branding and fork features and adopting upstream's new structure.

- `packages/client/src/effect/service.ts`, `packages/client/src/promise/service.ts`
  - Adopted upstream's refactor: `decide`/`headers`/`probeResult`/`same` now come from the new `packages/client/src/service-probe.ts`; upstream's `stop` body (best-effort `PtyHandoff` with `ensureTiming(options)`) in the promise flavor.
  - Kept the fork's branded `fallback()` returning `<state>/opencode/closecode-service.json` **locally** in both files (removed `fallback` from the `../service-probe.js` import) because the fork's client tests (`packages/client/test/service.test.ts` "discovers the fork fallback registration when no file is given", `promise-service.test.ts`) rely on that filename when no explicit file is given.
  - WARNING: upstream's new `packages/client/src/service-probe.ts` still exports `fallback()` returning `<state>/opencode/service.json`. It is now unused by the two service flavors. The fork's CLI writes `closecode-service.json` (`packages/cli/src/services/service-config.ts`), so `service-probe.ts::fallback` should be rebranded to `closecode-service.json` (out of the resolved file set).
- `packages/core/src/plugin/agent.ts` — kept the fork `AgentToolset` import (used by the fork `unitymaster`/`BlenderMaster` agents); dropped the now-unused `Permission` import (upstream removed its explore-agent usage).
- `packages/core/src/session/context.ts` — kept the fork toolset argument `registry.snapshot(permissions, agent.info.toolset)` and adopted upstream's `builtins.load()` signature (no `sessionID`).
- `packages/client/package.json`, `packages/core/package.json`, `packages/plugin/package.json`, `packages/sdk/package.json`, `packages/server/package.json`, `packages/session-ui/package.json`, `packages/tui/package.json`, `packages/ui/package.json` — kept the fork's release version `0.2.6` (fork re-versions published packages; root is `0.2.6`) instead of upstream `2.0.26`.
- `services/www/src/docs/content/cli/commands.mdx` — adopted upstream content with `closecode` branding: reworded intro; `auth login --method key` (current CLI uses method `key`); `api session.list`/`api session.create` (generated operation IDs have no `v2.` prefix); `upgrade 2.0.21`; removed the nonexistent `uninstall --keep-config --keep-data` example.

Verification: 0 conflict markers across all 13 files; the 8 `package.json` files parse as valid JSON. Not staged (merge in progress).

## 2026-10-14 — resolve `upstream-v2` merge conflicts: CLI updater/server + desktop branding (batch 2)

Source: same in-progress merge. Resolved conflicts in the CLI updater/service surfaces and desktop branding surfaces, keeping CloseCode branding while adopting upstream's new logic.

- `packages/cli/src/services/updater.ts` — adopted upstream's update-service release logic (`channel`, `distribution`, Homebrew-Core `core`/`formulae.brew.sh`, `installedFormula`, `latest(method?)`, `flock`, `installerBash`, `executable`); kept the fork's `inspect` auto-update-disabled-by-default guard, the fork `curlBinaries` array, and the fork curl installer URL (`raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install`). User-facing error strings rebranded to CloseCode.
- `packages/cli/src/server-process.ts` — adopted upstream's bind-race retry (`findIncumbent` loop) with the fork's `closecode service set port <port>` hint.
- `packages/cli/src/acp/agent.ts` — adopted upstream's `Effect.fnUntraced` `connect` + `HandlerContext`; kept ACP agent name `closecode`.
- `packages/cli/src/commands/commands.ts` — adopted upstream's `Argument.String`, uninstall description rebranded ("Uninstall CloseCode, keeping session data, configuration, and state").
- `packages/cli/src/commands/handlers/uninstall.ts` — adopted upstream's cache-only uninstall (removed the old `directories`/`keepData`/`keepConfig` behavior, shared upstream code upstream later dropped).
- `packages/cli/test/service.test.ts`, `packages/cli/test/updater-install.test.ts` — kept upstream tests, rebranded hard-coded service filenames to `closecode-service-*.json`, and kept the fork curl installer URL.
- `packages/cli/package.json`, `packages/desktop/package.json` — kept fork version `0.2.6`; `@opencode-ai/pty` adopted upstream `0.2.0`.
- `packages/desktop/scripts/bench-startup.ts`, `scripts/copy-metainfo.ts`, `src/main/constants.ts`, `src/main/service/desktop-cli.ts` — kept fork branding (`CloseCode Dev`, `CloseCode`, `closecode` bin).
- `packages/gui-extensions/src/updater/platform.ts` — adopted upstream `Effect.fn("Updater.platform")(channel)`; kept fork `stableArtifact` GitHub URL and CloseCode strings.
- ANALYSIS (not edited): 6 fork-modified files deleted by upstream were relocated to `packages/gui-extensions`: `acp/event.ts` (ACP refactor), `remote/cli.test.ts`→`ssh/remote-cli.ts`, `ssh/bootstrap.test.ts`, `ssh/service.ts`→`ssh/bootstrap.ts`, `wsl/local.ts`, `wsl/servers.test.ts`. Recommend accepting deletion. GAP: relocated `packages/gui-extensions/src/wsl/local.ts` still builds `opencode-${target}`/`bin/opencode` and `wsl/remote-cli.ts` still targets `.opencode/bin/opencode`; the fork's `closecode` naming is missing there.

Verification: 0 conflict markers across all 14 files; both `package.json` files parse as valid JSON; `bun build --no-bundle` transpiles all 12 changed TS files cleanly.
