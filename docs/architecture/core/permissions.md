# Core / Permissions

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns permission rule evaluation and the ask/reply flow for gated actions (tool calls, shell, filesystem). Does not own tool execution or session control; it decides allow/ask/deny and blocks or corrects callers.

## Key Paths
- `packages/core/src/permission.ts` — `Permission.Service`, `evaluate`, `evaluateAny`, `merge`, `AskResult`, error types (`DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`); re-exports `Rule`/`Ruleset` from `@opencode/schema/permission`
- `packages/core/src/permission/` — `saved.ts`, `sql.ts` (persisted rules)
- `packages/core/src/permission` — request/reply/assert input shapes in the same file: `AssertInput`/`ReplyInput` are plain interfaces (not schemas), plus the `invocation` helper
- `packages/schema/src/permission.ts`, `permission-saved.ts`, `permission-v1.ts` — rule and request shapes
- `packages/core/src/v1/permission.ts` — v1 compatibility

## Public API / Key Types
- `Permission.Service` (`@opencode/Permission`), `Permission.evaluate(action, resource, ...rulesets)`, `Permission.merge(...rulesets)`
- `Permission.evaluateAny(action, resources, ...rulesets)` (`permission.ts:113`) — one last-match-wins decision across a candidate resource set (later ID rule overrides earlier tag rule and vice versa)
- `AssertInput` (`permission.ts:34`) — plain interface `Omit<Request, "id" | "message">` + optional `id`/`agent` + `candidates?: readonly string[]` (`:37`); the duplicated `RequestFields` schema const is gone (v2.2.6 merge)
- `AssertInput.candidates` — when present, `denied`/`outcome` fold `resources + candidates` through `evaluateAny` (`permission.ts:203-211`); `evaluate` and `assert` without `candidates` are unchanged
- `Permission.invocation(context)` (`permission.ts:41`) — builds the requester fields `{sessionID, agent, source: {type: "tool", messageID, id}}` from a `Tool.Context` for tool assertions; `Permission.Interface` exposes upstream `assertNotDenied` (`:142`) and `allows` (`:144`) beside fork `evaluateAny`/`candidates`
- `Permission.ID`, `Permission.Source`, `Permission.Request`, `Permission.Reply`, `Permission.Effect`
- Errors: `DeclinedError`, `CorrectedError`, `BlockedError`, `NotFoundError`

## Dependencies
- In: `schema/permission`, database.
- Out: tools, session runner, server (`permission` route, `form` elicitation).

## Links
- Parent: INDEX.md
