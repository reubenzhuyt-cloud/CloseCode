# CloseCode Sidecar Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the fork's existing compiled binary as a second command `closecode`, side by side with the official `opencode`, sharing the same data/config.

**Architecture:** No repository changes. The official `opencode.exe` lives in `%APPDATA%\npm\node_modules\opencode-ai\bin\`. We copy the fork's compiled `opencode.exe` from `packages/opencode/dist/opencode-windows-x64/bin/` to `%APPDATA%\npm\closecode.exe`. Both programs derive their data directory from the hardcoded constant `app = "opencode"` (`packages/core/src/global.ts:10-15`), so sharing is automatic.

**Tech Stack:** PowerShell (`Copy-Item`), compiled Bun executables. No build step required — the dist binary already matches HEAD (built 2026-09-15 01:26:42, HEAD source commit `7ced4dbf1` 01:25:46).

## Global Constraints

- Do not modify any repository code or identity (package name, `bin`, branding, version string, user-agent).
- Do not edit `PATH` or create a new install directory.
- Do not add a build/deploy automation script.
- Do not run `opencode` and `closecode` simultaneously (shared SQLite DB + shared `state` Flock lock).
- Fork builds have auto-update hardcoded off (`OPENCODE_DISABLE_AUTOUPDATE: true`, commit `2ae49a357`) — `closecode` will not self-replace.
- Reuse the existing `dist/opencode-windows-x64/bin/opencode.exe`; do not rebuild.
- This task produces **no repository changes** — there is nothing to commit afterward.

---
### Task 1: Deploy fork build as `closecode.exe`

**Files:**
- Copy source: `E:\OpenCodeFork\packages\opencode\dist\opencode-windows-x64\bin\opencode.exe`
- Copy target: `C:\Users\31087\AppData\Roaming\npm\closecode.exe`

**Interfaces:**
- Produces: a working `closecode` command on the existing `PATH` (the npm global dir is already on `PATH`, same place `opencode.ps1` resolves).

- [ ] **Step 1: Record the official binary's fingerprint (before)**

Run in PowerShell:
```powershell
$b = "C:\Users\31087\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe"
Get-Item $b | Select-Object Length,LastWriteTime
```
Expected: `Length 179998248`, `LastWriteTime` today (official 1.18.31). Save these values to compare in Step 5.

- [ ] **Step 2: Copy the fork binary to `closecode.exe`**

```powershell
Copy-Item `
  "E:\OpenCodeFork\packages\opencode\dist\opencode-windows-x64\bin\opencode.exe" `
  "C:\Users\31087\AppData\Roaming\npm\closecode.exe" -Force
```
Expected: no errors; `C:\Users\31087\AppData\Roaming\npm\closecode.exe` now exists (172,471,808 bytes).

- [ ] **Step 3: Verify `closecode --version`**

```powershell
& "C:\Users\31087\AppData\Roaming\npm\closecode.exe" --version
```
Expected: prints `1.18.31-warm` (fork build identity).

- [ ] **Step 4: Verify the official `opencode` is untouched**

```powershell
opencode --version
$b = "C:\Users\31087\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe"
Get-Item $b | Select-Object Length,LastWriteTime
```
Expected: `opencode --version` prints `1.18.31`; the file `Length`/`LastWriteTime` match Step 1 exactly (179998248 bytes, original mtime).

- [ ] **Step 5: Verify shared data is on the same directory**

```powershell
# No env overrides are set, so both resolve here:
Test-Path "$env:USERPROFILE\.local\share\opencode"
Test-Path "$env:USERPROFILE\.config\opencode"
```
Expected: both `True`. This confirms the data directory is the same one `opencode` uses (no `OPENCODE_CONFIG_DIR` / `XDG_*` overrides were set for this task).

- [ ] **Step 6: Manual smoke (optional, expect possible fork 500)**

```powershell
closecode
```
Expected behavior: TUI launches and lists the same sessions as `opencode`. If it instead shows `Unexpected server error. Check server logs for details.` that is the **known, out-of-scope** fork bug — proceed; the deploy itself succeeded (Steps 3–4 are the pass/fail gates for this task).

- [ ] **Step 7: Confirm no repo changes to commit**

```powershell
git -C E:\OpenCodeFork status --short
```
Expected: no new staged/untracked files from this task (existing dirty files in `packages/client`, `packages/sdk`, `bun.lock` are pre-existing and unrelated). No commit is made — the deliverable is the `closecode.exe` file on disk.
