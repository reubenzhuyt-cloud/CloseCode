# CloseCode Sidecar Install — Design

Date: 2026-09-15
Status: Approved (design)

## Goal

Run the fork's compiled build as a second command, `closecode`, side by side with the
official npm-installed `opencode`, without either program clobbering the other, while
both share the same sessions, database, config, and credentials.

## Current State (verified 2026-09-15)

| Item | Value |
|---|---|
| `%APPDATA%\npm\node_modules\opencode-ai\bin\opencode.exe` | official npm build, `1.18.31`, 179,998,248 bytes |
| `packages/opencode/dist/opencode-windows-x64/bin/opencode.exe` | fork build, `1.18.31-warm`, 172,471,808 bytes |
| `%APPDATA%\npm\closecode.exe` | does not exist |
| Global npm dir is on `PATH` | yes (`opencode.ps1` / `.cmd` / shim resolve there) |

Data/config paths are hardcoded from `const app = "opencode"` in
`packages/core/src/global.ts:10-15`:

- data `~/.local/share/opencode`
- config `~/.config/opencode`
- state `~/.local/state/opencode` (holds the Flock global lock)
- cache `~/.cache/opencode`

Auto-update is hardcoded off in fork builds
(`packages/core/src/flag/flag.ts`, `OPENCODE_DISABLE_AUTOUPDATE: true` in commit `2ae49a357`),
so `closecode` will not self-replace with the official release.

## Decisions

1. **Identity scope: command name only.** No changes to the repository identity — package
   name, `bin` entry, UI title, version string, and user-agent stay `opencode`.
2. **Install location: npm global directory.** `closecode.exe` sits next to the official
   `opencode.exe` and is distinguished purely by filename. No `PATH` edits.
3. **Full data sharing.** Because the data directory name is derived from `app = "opencode"`,
   `closecode` automatically shares sessions, DB, config, and credentials with `opencode`.
4. **No build automation yet.** Deployment is a single file copy. A rebuild-and-deploy script
   is deliberately deferred until source iteration actually requires it.

## Mechanism

```powershell
Copy-Item `
  "E:\OpenCodeFork\packages\opencode\dist\opencode-windows-x64\bin\opencode.exe" `
  "$env:APPDATA\npm\closecode.exe" -Force
```

Building the fork, when its source changes, remains a separate manual step:

```powershell
# from packages/opencode
bun run build --single
```

Then re-run the copy above. `--single` builds only the current platform.

## Non-Goals

- No rename of the repository package, binary, or branding.
- No separate data directory or `XDG`/`OPENCODE_CONFIG_DIR` overrides.
- No `PATH` modification or new install directory.
- No build/deploy automation script.
- No fix for the fork's `Unexpected server error` HTTP 500 in this change; that is a
  separate task.

## Constraints

- **Do not run `opencode` and `closecode` simultaneously.** Both use the same SQLite database
  and the same `state` directory for the process-wide `Flock` lock.
- Both currently report the same generation (`1.18.31` official vs `1.18.31-warm` fork), so
  schema drift is not expected today. If the fork ever carries newer migrations, whichever
  program runs first applies them and the older one may fail to start.

## Verification

1. `closecode --version` prints `1.18.31-warm`.
2. `opencode --version` still prints `1.18.31` (official untouched).
3. `closecode` starts the TUI and lists the same sessions as `opencode`.
4. `opencode.exe` inode/size/mtime is unchanged by the copy.
