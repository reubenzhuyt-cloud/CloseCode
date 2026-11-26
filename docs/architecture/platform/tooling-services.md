# Tooling, Services & Infra

> last-verified: 0b1033a1ab @ 2026-11-26

## Responsibility
Repo-level build/release tooling, deployed services, and the VS Code SDK. Owns the developer/release workflow and deployment definitions; not part of the shipped runtime. Default branch is `dev` (AGENTS.md); PRs target `dev`. There is no infrastructure-as-code layer any more: SST (`infra/`, root `sst.config.ts`) is gone and each service deploys itself through `cf` + `cloudflare.config.ts`.

## Key Paths
- `script/` — repo scripts: `release.ts` (changelog/release review), `pack.ts` (root `bun run pack`), `generate.ts`, `format.ts`, `lint-changed.ts`, `check-greys.ts`, `sdk-docs.ts`, `native-arch.ts`, `profile-typecheck*.ts`, `upgrade-{opentui,mcp-sdk}.ts`, `install-closecode.ps1`; `script/ast-grep/` + `script/oxlint/` lint rules; `script/github/` (close-issues/close-prs), `script/drive/`, `script/hooks/`
- `packages/script/src/index.ts` — `@opencode/script`: Bun version guard derived from root `packageManager` (enforces `^1.4.4`), channel/version resolution — latest-channel builds throw without `OPENCODE_VERSION` (`index.ts:38`) — shell helpers
- `packages/data/` — the stats product, upstream's replacement for `packages/stats/`: `app/` (`@opencode/data-app`, SolidStart site + OG worker), `core/` (`@opencode/data-core`: `stat-sync`, `r2-sql`, domain aggregates), `server/` (`@opencode/data-server`: cron/workflow/sync workers)
- `packages/cli-rs/` — native Rust CLI/TUI (`opencode-native`), 17 crates under `crates/` (`util`, `api-types`, `api`, `local`, `service`, `store`, `plugin-abi`, `ui`, `plugin`, `latex`, `mermaid`, `tui`, `mini`, `acp`, `drive`, `parity`, `cli`); a client of the TS server, held to TS behavior by `parity/` suites (docs: `packages/cli-rs/docs/{architecture,plugins,plugin-abi,testing}.md`)
- `services/` — deployed services: `site` (website + V2 docs), `files` (R2 `/files/*`), `data` (`/data` site, OG images, sync workflow), `legacy` (deprecated: `opncd.ai` share stub + `api.opencode.ai` GitHub App token exchange — absorbs the old `packages/function` and `services/share`), `update` (release metadata and update selection). `services/README.md` is the index
- `services/site/src/docs/` — the one docs set: `config.ts` `docsSets = [latestDocs]`, mounted at `/docs` (English only); `/v1/docs…` 302s to the same path on `/docs` and `docs.opencode.ai` host-redirects (`route.ts`); content in `src/docs/content/**` — nothing reads the retired `packages/web` app, and `src/docs/v1` + `public/v1` do not exist
- `services/site/src/lib/install-commands.ts` — **the single list of the fork's install paths** the site advertises: clone + `bun install` + `bun run --cwd packages/cli build --single` (binary `packages/cli/dist/cli-<os>-<arch>/bin/closecode`) and, on Windows, clone + `script/install-closecode.ps1`; `docsInstalls`/`sdkInstalls`/`desktopInstall` derive from it. Upstream npm/Homebrew/AUR/mise/standalone-download rows are removed and `test/install-commands.test.ts` guards `src`/`public`/`script` against reintroducing them (`exempt()` at `:32` now covers only `src/lib/github-snapshot.json`). Deliberately outside that guard: the Browse extension card (`src/component/site/extension-data.ts`) keeps its upstream `opencode.ai/browse/install` / npm `@opencode/browse` commands — a separate upstream product
- `services/site/script/` — asset, press, docs and screenshot generators/checks; every instruction says "run from `services/site`" (`capture-assets.ts:4`, `press-media.sh:5`, `assets/README.md`), matching the retired `packages/console/app` layout. `legal-history.ts` regenerates `src/lib/legal/history.ts` from the git history of `src/lib/legal/{privacy-policy,terms-of-service}.ts` plus the two real `/routes/legal/**/index.tsx` files; its file list must name files that existed in some commit, or `git log -- <files>` silently ignores them
- `nix/`, `flake.nix`
- `sdks/vscode/` — VS Code extension SDK (`src/`, `script/`)
- `script/github/`, `.github/workflows/`, `.github/release/` — CI plus upstream release scripts (`plan-release.sh`, `publish-*`, `sign-*`, `deploy-*` per service)
- `specs/v2/` — architecture specs (`session.md`, `event-stream-architecture.md`, `provider-policy.md`, `tools.md`, `catalog-config-plugin-lifecycle.md`, `claude-agent-provider.md`)
- `patches/`, `.opencode/` (agent/command/plugin/skill defs)

## Public API / Key Types
- `@opencode/script` shared script helpers
- `script/install-closecode.ps1` — `Test-Binary` source preflight verifies the resolved binary's `--version` before any target is stopped/patched; npm target scan includes unscoped `closecode-*` packages
- Model snapshot: `bun run --cwd packages/core update-models-snapshot`; embedded API skill: `bun run --cwd packages/core generate:api-skill`
- Verification: `bun run check` from repo root = lint (oxlint + ast-grep + sdk-docs + `check-greys`) + `bun turbo typecheck`; in a package, `bun typecheck` runs Bun's checker (`bun check`), `bun run typecheck:tsc` runs `tsc` — `tsc` is the source of truth when they disagree (AGENTS.md); `bun check` requires Bun ≥ 1.4.4
- Release CI (known gap): `.github/workflows/release.yml` + `.github/release/*.sh` are upstream's — the `plan` job is gated to `github.repository == 'anomalyco/opencode'` (`release.yml:53`) and the scripts use `opencode` artifact naming throughout. Fork releases do not run through this workflow as-is; treat it as unadapted upstream code, not working fork release tooling
- Known gap (deliberate): `services/site/src/lib/download.ts` still resolves desktop downloads from upstream `https://opencode.ai/update/api` (`updateApi`, `getDownloadHref`, `desktopBuilds`, `desktopAssets`); emptying it changes site UI and is a product decision
- Known gap: `.github/workflows/triage-close-issues.yml` is upstream's and `script/github/close-issues.ts:5` hardcodes `repo = "anomalyco/opencode"`, so the scheduled job targets upstream issues from the fork repo
- Known gap (harmless): `services/site/public/brand/screenshots/manifest.json` still records `generator.script = packages/console/app/script/capture-assets.ts`; `script/capture-assets.ts` only writes that field (never compares it), so it refreshes on the next capture

## Notes
- Deliberate leftovers from the SST/`packages/console` removal: `script/release.ts:15-18` still excludes `packages/console`, `packages/data`, `services` and `infra` from the release-range pathspec — harmless on this tree and a guard against re-import. `.prettierignore`, `.oxlintrc.json` (`ignorePatterns`), `.dockerignore` and `.gitignore` carry no SST entries; `packages/console` survives only as untracked build leftovers on disk (`git ls-files packages/console` = 0).
- `.opencode/agent/translator.md:53` names the glossary provenance as `services/site/src/docs/content/*.mdx`; the old `src/docs/v1` tree has no remaining reference in site code or tests.

## Dependencies
- In: root workspace; consumed by CI/release.
- Out: none (terminal tooling).

## Links
- Parent: INDEX.md
