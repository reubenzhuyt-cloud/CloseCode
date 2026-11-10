# Server / Handlers

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Implements every HttpApi group as an Effect handler layer, translating HTTP inputs into Core service calls and shaping responses. One file per resource; `handlers.ts` merges them. Does not declare the contract (protocol) or own domain behavior (Core).

## Key Paths
- `packages/server/src/handlers.ts` — `handlers` = merge of all handler layers
- `packages/server/src/handlers/` — one handler per group: `agent`, `artifact`, `command`, `config`, `credential`, `debug`, `event`, `form`, `fs`, `generate`, `integration`, `job`, `location`, `mcp`, `media`, `message`, `migration`, `model`, `permission`, `persistent-pty`, `plugin`, `project`, `provider`, `pty`, `pty-socket`, `reference`, `rpc`, `schedule`, `server`, `session`, `session-error`, `shell`, `skill`, `usage`, `vcs`, `voice`, `websearch`, `worktree`
- `packages/server/src/location.ts` — `LocationMiddleware`, `LocationServices`, `requestRef(request)`, `sessionInfo`, `response`; exports `awaitPlugins` (`location.ts:39`), the temporary plugin-activation wait used only by policy/diagnostic handlers (see core/plugin-system.md)

## Public API / Key Types
- `handlers` (`Layer`) — provides all group handlers; consumed by `fetch.ts`/`routes.ts`
- `LocationMiddleware` — injects `LocationServices` from the request's location
- `sessionInfo(sessions, sessionID)` — resolves a session or errors
- `handlers/skill.ts` — `skill.list` → `Skill.Service.list`; `skill.diagnostic` awaits plugins (`awaitPlugins`), resolves the agent via `Agent.Service.resolve` (404 `AgentNotFoundError` for unknown ids), delegates to `SkillDiagnostic.diagnose`. Denial provenance is limited to `origin: "agent"` (`originPath` never set): config plugins flatten global/project/agent rules into one `Agent.Info.permissions` array, so `global`/`session` origins are not yet attributable

## Conventions
- Handler groups map 1:1 to `packages/protocol/src/groups/*`. When the protocol changes, handlers must follow; run `bun run generate` from `packages/client` after public Protocol/`HttpApi` changes.

## Dependencies
- In: `core` services, `protocol` groups, `schema`.
- Out: `routes.ts`/`fetch.ts`.

## Links
- Parent: INDEX.md
