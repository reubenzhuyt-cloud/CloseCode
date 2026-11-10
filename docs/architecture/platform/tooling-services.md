# Tooling, Services & Infra

> last-verified: 742785d1eb @ 2026-11-10

## Responsibility
Repo-level build/release tooling, deployed services, infrastructure-as-code, and the VS Code SDK. Owns the developer/release workflow and deployment definitions; not part of the shipped runtime. Default branch is `dev` (AGENTS.md); PRs target `dev`.

## Key Paths
- `script/` — repo scripts: `release.ts` (changelog/release review), `pack.ts` (root `bun run pack`: packs every npm-published package), `generate.ts`, `format.ts`, `lint-changed.ts`, `sdk-docs.ts`, `native-arch.ts`, `profile-typecheck*.ts`, `upgrade-{opentui,mcp-sdk}.ts`, `install-closecode.ps1`; `script/ast-grep/` + `script/oxlint/` lint rules; `script/github/` (close-issues/close-prs), `script/drive/`, `script/hooks/` — the old `publish.ts`/`changelog.ts`/`version.ts`/`sign-windows.ps1` are gone (upstream removed them)
- `packages/script/src/index.ts` — `@opencode/script`: Bun version guard derived from root `packageManager` (enforces `^1.4.4`), channel/version resolution — latest-channel builds throw without `OPENCODE_VERSION` (`index.ts:38`) — shell helpers
- `packages/stats/` — hosted stats app (`app/`, `core/`, `server/`)
- `services/` — deployed services: `site`, `files`, `share`, `update`
- `services/site/src/docs/` — the one docs set: `config.ts` `docsSets = [latestDocs]`, mounted at `/docs` (English only); `/v1/docs…` 302s to the same path on `/docs` and `docs.opencode.ai` host-redirects (`route.ts`); content in `src/docs/content/**` — nothing reads the retired `packages/web` app
- `services/site/src/lib/install-commands.ts` — **the single list of the fork's install paths** the site advertises: clone + `bun install` + `bun run --cwd packages/cli build --single` (binary `packages/cli/dist/cli-<os>-<arch>/bin/closecode`) and, on Windows, clone + `script/install-closecode.ps1`; `docsInstalls`/`sdkInstalls`/`desktopInstall` derive from it. Upstream npm/Homebrew/AUR/mise/standalone-download rows are removed and `test/install-commands.test.ts` guards `src`/`public`/`script` against reintroducing them. Deliberately outside that guard: the Browse extension card (`src/component/site/extension-data.ts`) keeps its upstream `opencode.ai/browse/install` / npm `@opencode/browse` commands — a separate upstream product
- `infra/` — SST stacks (`app.ts`, `stage.ts`, `stats.ts`, `webapp.ts`); `sst.config.ts` at root (old `console.ts`/`enterprise.ts`/`lake.ts`/`monitoring.ts`/`secret.ts` are gone)
- `nix/`, `flake.nix` (the old root `containers/`, `perf/`, `artifacts/` are gone)
- `sdks/vscode/` — VS Code extension SDK (`src/`, `script/`)
- `script/github/`, `.github/workflows/`, `.github/release/` — CI plus upstream release scripts (sign/publish shell scripts)
- `specs/v2/` — architecture specs (`session.md`, `event-stream-architecture.md`, `provider-policy.md`, `tools.md`, `catalog-config-plugin-lifecycle.md`, `claude-agent-provider.md`)
- `patches/`, `.opencode/` (agent/command/plugin/skill defs)

## Public API / Key Types
- `@opencode/script` shared script helpers
- `script/install-closecode.ps1` — `Test-Binary` source preflight verifies the resolved binary's `--version` before any target is stopped/patched; npm target scan includes unscoped `closecode-*` packages (unchanged by the v2.2.6 merge)
- Model snapshot: `bun run --cwd packages/core update-models-snapshot`
- Verification: `bun run check` from repo root = lint (oxlint + ast-grep + sdk-docs) + `bun turbo typecheck`; in a package, `bun typecheck` runs Bun's checker (`bun check`), `bun run typecheck:tsc` runs `tsc` — `tsc` is the source of truth when they disagree (AGENTS.md); `bun check` requires Bun ≥ 1.4.4
- Release CI (known gap): `.github/workflows/release.yml` + `.github/release/*.sh` are upstream's — the `plan` job is gated to `github.repository == 'anomalyco/opencode'` (`release.yml:49`) and the release scripts use `opencode` artifact naming throughout (152 `opencode` vs 0 `closecode` matches). Fork releases do not run through this workflow as-is; treat it as unadapted upstream code, not working fork release tooling.
- Known gap (deliberate): `services/site/src/lib/download.ts` still resolves desktop downloads from upstream `https://opencode.ai/update/api` (`updateApi` `:107`, `getDownloadHref`, `desktopBuilds`, `desktopAssets`); emptying it changes site UI and is a product decision.

## Dependencies
- In: root workspace; consumed by CI/release.
- Out: none (terminal tooling).

## Links
- Parent: INDEX.md
