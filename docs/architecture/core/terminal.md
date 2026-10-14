# Core / Terminal

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns interactive terminals and shell execution: PTY sessions, persistent PTY daemons, shell parsing, and command execution. Does not own the model-facing shell tool wrapper (tools.md) nor HTTP/WebSocket transport (server.md).

## Key Paths
- `packages/core/src/pty.ts`, `pty/` — `Pty.Service`, `Info`, `CreateInput`, `UpdateInput`, `protocol.ts`, `ticket.ts`, `pty.{bun,node,workerd}.ts` (platform `#pty` condition)
- `packages/core/src/persistent-pty.ts`, `persistent-pty/` — `daemon.ts`, `pty-binding.ts`, `binary.{bun,node,workerd}.ts` (platform `#persistent-pty-binary`), `index.ts`
- `packages/core/src/shell.ts`, `shell/` — `Shell.Service`, `NotFoundError`, `cleanup`, retention; `parse.ts`, `scan.ts`, `select.ts`, `result.ts`, `parser-wasm.{bun,node,workerd}.ts`
- `packages/schema/src/pty.ts`, `pty-ticket.ts`, `persistent-pty.ts`, `shell.ts` — terminal wire shapes

## Public API / Key Types
- `Pty.Service` (`@opencode/Pty`), `PersistentPty`, `Shell.Service` (`@opencode/Shell`)
- Platform-conditional imports `#pty`, `#persistent-pty-binary`, `#shell-parser-wasm`
- `Shell.RETENTION` (7 days), `Shell.cleanup`

## Dependencies
- In: `schema/pty|shell`, `@opencode-ai/pty`, util, filesystem.
- Out: tools (shell tool), session (shell steps), server (`pty`, `persistentPty`, `shell` routes + `pty-socket`).

## Links
- Parent: INDEX.md
