# Server / Handlers

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Implements every HttpApi group as an Effect handler layer, translating HTTP inputs into Core service calls and shaping responses. One file per resource; `handlers.ts` merges them. Does not declare the contract (protocol) or own domain behavior (Core).

## Key Paths
- `packages/server/src/handlers.ts` — `handlers` = `Layer.mergeAll` of every group handler (`:36`); the `server.experimental` group is one handler (`PersistentPtyHandler`) that fans out to the artifact/blob/automation/job/machine/media builders
- `packages/server/src/handlers/` — one file per resource. Most export an `HttpApiBuilder.group` (`agent`, `command`, `config`, `credential`, `debug`, `event`, `form`, `fs`, `generate`, `integration`, `location`, `mcp`, `message`, `migration`, `model`, `permission`, `plugin`, `project`, `provider`, `pty`, `pty-socket`, `reference`, `rpc`, `server`, `session`, `session-error`, `shell`, `skill`, `usage`, `vcs`, `voice`, `websearch`, `worktree`); `artifact`, `automation`, `blob`, `job`, `machine`, `media` export `make*` builders that `persistent-pty.ts` composes into the single `server.experimental` group
- `packages/server/src/handlers/persistent-pty.ts` — hosts the `server.experimental` group; builders `makeArtifact`, `makeBlobGet`, `makeAutomation`, `makeJob`, `makeMachine`, `makeMachineLink`, `makeMediaGet`
- `packages/server/src/location.ts` — `LocationMiddleware`, `LocationServices`, `requestRef(request)`, `sessionInfo`, `response`
- `packages/server/src/range.ts` — `ByteRange.parse(header, size)` → range / `"unsatisfiable"` / undefined, shared by `fs.read` and `blob.get`
- `packages/server/src/handlers/skill.ts` — `skill.list` → `Skill.Service.list`; `skill.diagnostic` resolves the agent via `Agent.Service.resolve` (404 `AgentNotFoundError` for unknown ids) and delegates to `SkillDiagnostic.diagnose` from `entries()`/`shadowed()`, with no plugin wait. Denial provenance is limited to `origin: "agent"`: config plugins flatten global/project/agent rules into one `Agent.Info.permissions` array, so `global`/`session` origins are not yet attributable
- `packages/server/src/handlers/machine.ts` — `machine.link` is a raw route outside the API folder: it upgrades to a WebSocket, runs the Noise handshake with iroh/relay carriers, and hands accepted links to `Machines.Service`
- `packages/server/src/handlers/automation.ts` — automation CRUD; every create settles asks unattended (`Effect.provideService(Permission.Unattended, [])`) because a stateless HTTP caller has no UI listener

## Public API / Key Types
- `handlers` (`Layer`) — provides all group handlers; consumed by `fetch.ts`/`routes.ts`
- `LocationMiddleware` — injects `LocationServices` from the request's location
- `sessionInfo(sessions, sessionID)` — resolves a session or errors
- `machine.machinesEnabled` (`handlers/machine.ts:57`) — the flag gate every machine route shares

## Conventions
- Handler groups map 1:1 to `packages/protocol/src/groups/*`. When the protocol changes, handlers must follow; run `bun run generate` from `packages/client` after public Protocol/`HttpApi` changes.
- Handlers never wait for plugin activation (AGENTS.md "Plugin Loading"); see core/plugin-system.md.

## Dependencies
- In: `core` services, `protocol` groups, `schema`.
- Out: `routes.ts`/`fetch.ts`.

## Links
- Parent: INDEX.md
