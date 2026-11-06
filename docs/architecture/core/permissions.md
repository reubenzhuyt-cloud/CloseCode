# Core / Permissions

> last-verified: 36ea08c6b5 @ 2026-11-06

## Responsibility
Owns permission rule evaluation and the ask/reply flow for gated actions (tool calls, shell, filesystem). Does not own tool execution or session control; it decides allow/ask/deny and blocks or corrects callers.

## Key Paths
- `packages/core/src/permission.ts` — `Permission.Service`, `evaluate`, `evaluateAny`, `merge`, `AskResult`, error types (`DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`); re-exports `Rule`/`Ruleset` from `@opencode/schema/permission`
- `packages/core/src/permission/` — `saved.ts`, `sql.ts` (persisted rules)
- `packages/core/src/permission` request/reply/assert input schemas in same file
- `packages/schema/src/permission.ts`, `permission-saved.ts`, `permission-v1.ts` — rule and request shapes
- `packages/core/src/v1/permission.ts` — v1 compatibility

## Public API / Key Types
- `Permission.Service` (`@opencode/Permission`), `Permission.evaluate(action, resource, ...rulesets)`, `Permission.merge(...rulesets)`
- `Permission.evaluateAny(action, resources, ...rulesets)` (`permission.ts:106`) — one last-match-wins decision across a candidate resource set (later ID rule overrides earlier tag rule and vice versa)
- `AssertInput.candidates` (`permission.ts:46`) — when present, `denied`/`outcome` fold `resources + candidates` through `evaluateAny` (`permission.ts:192-203`); `evaluate` and `assert` without `candidates` are unchanged
- `Permission.ID`, `Permission.Source`, `Permission.Request`, `Permission.Reply`, `Permission.Effect`
- Errors: `DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`

## Dependencies
- In: `schema/permission`, database.
- Out: tools, session runner, server (`permission` route, `form` elicitation).

## Links
- Parent: INDEX.md
