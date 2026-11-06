# CLI (`@opencode/cli`)

> last-verified: 36ea08c6b5 @ 2026-11-06

## Responsibility
The `closecode`/`opencode` binary: parses commands, runs the TUI, hosts the server and ACP integration, manages services/updates, and provides non-interactive run modes. Owns process entry and wiring; it does not own UI rendering (tui) or server behavior (server).

## Key Paths
- `packages/cli/src/index.ts` — binary entry (`NodeRuntime`, `Runtime`, observability, updater)
- `packages/cli/src/commands/commands.ts` — command definitions
- `packages/cli/src/framework/` — `runtime.ts`, `spec.ts` (command framework)
- `packages/cli/src/run/` — `index.ts`, `run.ts`, `noninteractive.ts`, `ui.ts`, `v1.ts`
- `packages/cli/src/services/` — `server-connection.ts`, `service-config.ts`, `service-registration.ts`, `standalone.ts`, `updater.ts`, `update-preflight.tsx`, `updater-action.ts`, `web-ui.ts`, `retained-image.ts`
- `packages/cli/src/services/updater.ts`, `server-process.ts` — update-service methods (channel/distribution, Homebrew, fork curl installer URL) and bind-race incumbent discovery for the background server
- `packages/cli/src/server-process.ts` — spawns/attach to the background server
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
