# Server / Handlers

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Implements every HttpApi group as an Effect handler layer, translating HTTP inputs into Core service calls and shaping responses. One file per resource; `handlers.ts` merges them. Does not declare the contract (protocol) or own domain behavior (Core).

## Key Paths
- `packages/server/src/handlers.ts` — `handlers` = merge of all handler layers
- `packages/server/src/handlers/` — one handler per group: `agent`, `command`, `config`, `credential`, `debug`, `event`, `form`, `fs`, `generate`, `integration`, `location`, `mcp`, `message`, `migration`, `model`, `permission`, `persistent-pty`, `plugin`, `project`, `provider`, `pty`, `pty-socket`, `reference`, `rpc`, `server`, `session`, `session-error`, `shell`, `skill`, `vcs`, `websearch`, `worktree`
- `packages/server/src/location.ts` — `LocationMiddleware`, `LocationServices`, `requestRef(request)`, `sessionInfo`, `response`

## Public API / Key Types
- `handlers` (`Layer`) — provides all group handlers; consumed by `fetch.ts`/`routes.ts`
- `LocationMiddleware` — injects `LocationServices` from the request's location
- `sessionInfo(sessions, sessionID)` — resolves a session or errors

## Conventions
- Handler groups map 1:1 to `packages/protocol/src/groups/*`. When the protocol changes, handlers must follow; run `bun run generate` from `packages/client` after public Protocol/`HttpApi` changes.

## Dependencies
- In: `core` services, `protocol` groups, `schema`.
- Out: `routes.ts`/`fetch.ts`.

## Links
- Parent: INDEX.md
