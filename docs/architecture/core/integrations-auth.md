# Core / Integrations & Auth

> last-verified: 36ea08c6b5 @ 2026-11-06

## Responsibility
Owns external capability integration and credentials: MCP servers, credential storage/OAuth, account/identity, integrations, web search, skills, and references. Does not own tools that call them (tools.md) nor HTTP transport.

## Key Paths
- `packages/core/src/mcp/` — `client.ts`, `stdio.ts`, `oauth.ts`, `instructions.ts`, `index.ts` (`Mcp.Service`, `ServerName`, `Status`, `PromptsChanged`)
- `packages/core/src/credential.ts`, `credential/sql.ts` — `Credential.Service`, `ID`, `OAuth`, `Key`, `Value`
- `packages/core/src/oauth/page.ts` — OAuth landing page
- `packages/core/src/account/sql.ts` — account/identity persistence
- `packages/core/src/integration.ts`, `integration/connection.ts` — `Integration.Service`, `ID`, `MethodID`, `AttemptID`, `OAuthMethod`
- `packages/core/src/websearch.ts` — `WebSearch.Service`, `ID`, `Provider`, `Input`
- `packages/core/src/skill.ts` — `Skill.Service` (`list`/`get`/`entries`/`shadowed`); the registry alone resolves same-ID entries by origin `project > global > plugin` — discovery hands it flat lists, so disk-vs-disk collisions resolve too and displaced entries land in `shadowed()` → `skill.diagnostic` `shadowed[]`. Helpers: `resources` (ID + `tag:<tag>`), `visible` (matches agent ID **or** display name), `available` (uses `Permission.evaluateAny`)
- `packages/core/src/skill/` — `discovery.ts`, `instructions.ts` (advertises via `Skill.visible`), `diagnostic.ts` (`SkillDiagnostic.diagnose` → `Skill.Diagnostic`; visibility mirrors the skill tool, including full `Agent.Info` identity matching)
- `packages/core/src/reference.ts`, `reference/instructions.ts` — `Reference.Service`, `LocalSource`/`GitSource`, `Source`
- `packages/schema/src/{mcp,credential,integration,websearch,skill,reference}.ts`, `mcp-event.ts`, `ide-event.ts`

## Public API / Key Types
- `Mcp.Service`, `Credential.Service`, `Integration.Service`, `WebSearch.Service`, `Skill.Service`, `Reference.Service`
- Skill contracts (`schema/skill.ts`): `Skill.Info.tags`, `Skill.Origin` (`project|global|plugin`), `Skill.Registration` (`{source?, agents?}`), `Skill.Diagnostic*` (wire shape for `skill.diagnostic`)
- Credential OAuth flows back the `credential` route; integrations back `integration`/`mcp` routes

## Dependencies
- In: `schema/*`, database, util, filesystem.
- Out: tools (mcp/websearch/skill), session instructions, server (`mcp`/`credential`/`integration`/`websearch`/`skill` routes), plugin.

## Links
- Parent: INDEX.md
