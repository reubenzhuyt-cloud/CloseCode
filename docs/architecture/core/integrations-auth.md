# Core / Integrations & Auth

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns external capability integration and credentials: MCP servers, credential storage/OAuth, account/identity, integrations, web search, skills, and references. Does not own tools that call them (tools.md) nor HTTP transport.

## Key Paths
- `packages/core/src/mcp/` — `client.ts`, `stdio.ts`, `socket-client.ts`, `connection.ts`, `pool.ts`, `oauth.ts`, `event-stream.ts` (MCP Events subscriptions), `instructions.ts`, `index.ts` (`Mcp.Service`, `ServerName`, `Status`, `PromptsChanged`)
- `packages/core/src/credential.ts`, `credential/sql.ts` — `Credential.Service`, `ID`, `OAuth`, `Key`, `Value`
- `packages/core/src/oauth/page.ts`, `oauth/redirect.ts` — OAuth landing page and redirect handling
- `packages/core/src/account/sql.ts` — account/identity persistence
- `packages/core/src/integration.ts`, `integration/connection.ts` — `Integration.Service`, `ID`, `MethodID`, `AttemptID`, `OAuthMethod`
- `packages/core/src/websearch.ts` — `WebSearch.Service`, `ID`, `Provider`, `Input`
- `packages/core/src/skill.ts` — `Skill.Service` (`list`/`get`/`files(id)`/`entries`/`shadowed`); state `Skill.Data` = winning `Entry` map + `files: Map<ID, ReadonlyMap<string,string>>` + `shadowed[]` diagnostics; same-ID resolution by origin `project > global > plugin`. Helpers: `resources` (ID + `tag:<tag>`), `visible`, `available(skills, policy)` (uses `PermissionPolicy.evaluateAny`), `prepare(fs, skill, files)`, `isRegistration`, `uri`/`isUri`
- `packages/core/src/skill/` — `discovery.ts`, `instructions.ts` (advertises via `Skill.visible`; `load(policy, {agent, metadata})`, `resolveSkillLevels` for `off`/`name`/`full` activation), `diagnostic.ts` (`SkillDiagnostic.diagnose`)
- `packages/core/src/reference.ts`, `reference/instructions.ts` — `Reference.Service`, `LocalSource`/`GitSource`, `Source`
- `packages/schema/src/{mcp,credential,integration,websearch,skill,reference}.ts`, `mcp-event.ts`, `ide-event.ts`
- `packages/core/src/plugin/skill/opencode/` — the built-in `opencode` skill's API reference, generated from `openapi.json` by `packages/core/script/generate-api-skill.ts` (`bun run generate:api-skill`)

## Public API / Key Types
- `Mcp.Service`, `Credential.Service`, `Integration.Service`, `WebSearch.Service`, `Skill.Service`, `Reference.Service`
- Skill contracts (`schema/skill.ts`): `Skill.Info.tags`, `Skill.Origin` (`project|global|plugin`), `Skill.Registration` (`{source?, agents?}`), `Skill.Diagnostic*` (wire shape for `skill.diagnostic`); core-side `Entry`/`ShadowedEntry` add per-entry `agents?` scoping and `shadowedBy` provenance
- `McpEvent.ExperimentalEvent` — at-least-once push from MCP Events, deduped on `id`/`eventId`; feeds automation event triggers
- Credential OAuth flows back the `credential` route; integrations back `integration`/`mcp` routes

## Dependencies
- In: `schema/*`, database, util, filesystem.
- Out: tools (mcp/websearch/skill), session instructions, automation (event triggers), server (`mcp`/`credential`/`integration`/`websearch`/`skill` routes), plugin.

## Links
- Parent: INDEX.md
