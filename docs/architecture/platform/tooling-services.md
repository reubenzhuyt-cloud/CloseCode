# Tooling, Services & Infra

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Repo-level build/release tooling, deployed services, infrastructure-as-code, and the VS Code SDK. Owns the developer/release workflow and deployment definitions; not part of the shipped runtime.

## Key Paths
- `script/` — repo scripts: `release.ts`, `publish.ts`, `changelog.ts`, `version.ts`, `update-artifact.ts`, `generate.ts`, `format.ts`, `sign-windows.ps1`, `install-closecode.ps1`; `script/ast-grep/` lint rules (`sgconfig.yml`, effect-simplification rules); `script/github/`, `script/drive/`, `script/hooks/`
- `packages/script/src/index.ts` — `@opencode/script` helper (Bun version guard, shell helpers)
- `packages/stats/` — hosted stats app (`app/`, `core/`, `server/`)
- `services/` — deployed services: `www` (Astro site), `files`, `update`
- `infra/` — SST stacks per surface (`app.ts`, `console.ts`, `enterprise.ts`, `lake.ts`, `monitoring.ts`, `secret.ts`, `stage.ts`, `stats.ts`, `webapp.ts`); `sst.config.ts` at root
- `nix/` (`scripts/`), `flake.nix`, `containers/` (`base`, `bun-node`, `rust`, `publish`, `tauri-linux`, `script`)
- `sdks/vscode/` — VS Code extension SDK (`src/`, `script/`)
- `github/script/`, `.github/workflows/` — CI
- `specs/v2/` — architecture specs (`session.md`, `event-stream-architecture.md`, `provider-policy.md`, `tools.md`, `catalog-config-plugin-lifecycle.md`)
- `perf/`, `artifacts/`, `patches/`, `.opencode/` (agent/command/plugin/skill defs)

## Public API / Key Types
- `@opencode/script` shared script helpers
- Model snapshot: `bun run --cwd packages/core update-models-snapshot`
- Full check: `bun run check` from repo root (lint + typecheck)

## Dependencies
- In: root workspace; consumed by CI/release.
- Out: none (terminal tooling).

## Links
- Parent: INDEX.md
