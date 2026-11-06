# Unarchived architecture deltas

Staged notes awaiting archivist merge. Newest first.

## 2026-11-06 — release 0.3.2 version bump + CLI artifact verification

- source: fork release step after the skill-scoping review fixes.
- change: version `0.3.1 → 0.3.2` over the same file set as 0.3.1 — root `package.json` and `packages/{app,cli,client,core,desktop,plugin,sdk,server,session-ui,tui,ui}/package.json`, plus the 11 workspace entries in `bun.lock` regenerated with `bun install --lockfile-only --ignore-scripts` (11 lines changed, no hand edits). No other repo `package.json` version field remains at `0.3.1`; the only remaining `0.3.1` string is the third-party `solid-sonner` pin in the root devDependencies.
- artifact: `packages/cli/dist/cli-windows-x64/bin/closecode.exe`, 189,022,720 bytes, sha256 `30D8D5753E90D10894E088740CD4175012630A2A8D67A02718F2A5A781C33284`, built with `OPENCODE_VERSION=0.3.2 bun run script/build.ts --single --skip-install --skip-web-ui`, `--version` prints `closecode v0.3.2`.
- verification: isolated harness (`%TEMP%\opencode\tag-deny-verify`, no user config touched) — `agent-a` tag deny still blocks `unity-one` (tool `Permission denied: skill`, diagnostic `unity-one<-tag:unity`), `agent-b` loads it, and the disk-vs-disk case keeps the project copy effective (`source: "project"`) with the global copy in `shadowed[]` (`shadowedBy: "project"`). Root `bun run check`: 1497 lint warnings / 0 errors, `sdk-docs` 0 problems, 36/36 typecheck tasks.

## Retained — release version-bump bookkeeping (0.3.0, 0.3.1)

- source: 2026-10-14 bundle-provider delta and 2026-10-21 release-0.3.1 delta
- change: version bumps `0.2.6 → 0.3.0 → 0.3.1` over the fork release file set (root + 11 workspace `package.json`, `bun.lock` entries; `OPENCODE_VERSION` injected at build time, no source version constant).
- retained: folded the durable code facts (provider `loadPackage` guard, installer preflight) into canonical docs; release bookkeeping has no canonical architecture doc home, and architecture docs do not track release numbers. Not re-verified beyond root `package.json` = `0.3.1`.
