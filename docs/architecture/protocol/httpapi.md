# Protocol / HttpApi

> last-verified: 36ea08c6b5 @ 2026-11-06

## Responsibility
Defines the V2 HTTP contract as an Effect `HttpApi`: which groups exist, what middleware wraps them, and how concrete service identities are injected. Owns placement/typing of the API; it does **not** implement handlers (Server does) and does not perform I/O.

## Key Paths
- `packages/protocol/src/api.ts` — `makeApi` (`:196`), `makeDefaultApi` (`:225`), `Api` type, `LocationGroups`/`SessionGroups` composition
- `packages/protocol/src/groups/` — one group per resource: `agent`, `command`, `config`, `credential`, `debug`, `event`, `form`, `fs`, `generate`, `integration`, `location`, `mcp`, `message`, `migration`, `model`, `permission`, `persistent-pty`, `plugin`, `project`, `provider`, `pty`, `reference`, `rpc`, `server`, `session`, `shell`, `skill`, `vcs`, `websearch`, `worktree`
- `packages/protocol/src/middleware/` — `authorization.ts`, `schema-error.ts`
- `packages/protocol/src/errors.ts` — shared protocol errors (`InvalidRequestError`, `SessionNotFoundError`)
- `packages/protocol/openapi.json` — generated OpenAPI document (139 endpoints; see `V2_HTTP_API_AUDIT.md`)
- `packages/protocol/src/simulation.ts` — simulation-specific API extension

## Public API / Key Types
- `makeApi({ definitions, locationMiddleware, formLocationMiddleware, sessionLocationMiddleware })` — binds Event group + middleware keys
- `makeDefaultApi(...)` — same with the default `EventGroup`
- `Api<...>` — parameterized HttpApi type; middleware placement is owned by Protocol while Server injects concrete keys (see `api.ts:132` comment)
- Group makers: `makeSessionGroup`, `makePermissionGroup`, `makeFormGroup`, `makeLocationGroup`, `makeEventGroup`
- `server.skill` group (`groups/skill.ts`): `skill.list` (`GET /api/skill`) plus read-only `skill.diagnostic` (`GET /api/skill/diagnostic`, query `LocationQuery` + required `agent: Agent.ID`, success `Skill.Diagnostic`, errors `AgentNotFoundError`/`ServiceUnavailableError`)

## Dependencies
- In: `schema` (event/session/config shapes), `effect/unstable/httpapi`.
- Out: `client` (derives `ClientApi`), `server` (implements groups), `plugin`.

## Links
- Parent: INDEX.md
