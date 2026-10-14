# Core / Permissions

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns permission rule evaluation and the ask/reply flow for gated actions (tool calls, shell, filesystem). Does not own tool execution or session control; it decides allow/ask/deny and blocks or corrects callers.

## Key Paths
- `packages/core/src/permission.ts` — `Permission.Service`, `evaluate`, `merge`, `AskResult`, error types (`DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`); re-exports `Rule`/`Ruleset` from `@opencode/schema/permission`
- `packages/core/src/permission/` — `saved.ts`, `sql.ts` (persisted rules)
- `packages/core/src/permission` request/reply/assert input schemas in same file
- `packages/schema/src/permission.ts`, `permission-saved.ts`, `permission-v1.ts` — rule and request shapes
- `packages/core/src/v1/permission.ts` — v1 compatibility

## Public API / Key Types
- `Permission.Service` (`@opencode/Permission`), `Permission.evaluate(action, resource, ...rulesets)`, `Permission.merge(...rulesets)`
- `Permission.ID`, `Permission.Source`, `Permission.Request`, `Permission.Reply`, `Permission.Effect`
- Errors: `DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`

## Dependencies
- In: `schema/permission`, database.
- Out: tools, session runner, server (`permission` route, `form` elicitation).

## Links
- Parent: INDEX.md
