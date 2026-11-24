# Core / Permissions

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns permission rule evaluation, the ask/reply flow, and saved approvals for gated actions (tool calls, shell, filesystem). Evaluation is a composable `PermissionPolicy` algebra (last-match-wins overrides, monotone denies, ask-settling fallbacks); this module decides allow/ask/deny and blocks or corrects callers. Does not own tool execution or session control.

## Key Paths
- `packages/core/src/permission/policy.ts` — `PermissionPolicy`: the `Policy` algebra and every evaluator, with no service deps. Semantics: `override` = ordered last-match-wins layers, `restrict` = monotone deny-wins layer that `fallback` cannot undo, `fallback` = ask-settling layer (saved approvals) that never overrides `deny` or `allow`
- `packages/core/src/permission.ts` — `Permission.Service`, `AssertInput`/`ReplyInput`/`AskResult`, error types, `Unattended` context reference; composes `PermissionPolicy` and re-exports `Policy`
- `packages/core/src/permission/saved.ts`, `sql.ts` — `PermissionSaved.Service` (per-project allow rows) and the `permission` table
- `packages/schema/src/permission.ts`, `permission-saved.ts`, `permission-v1.ts` — rule and request shapes
- `packages/core/src/v1/permission.ts`, `v1/config/permission.ts` — v1 compatibility, including the `experimental_image_generate` → `generate_image` rule migration
- `packages/core/src/shell/permissions.ts` — shell-command permission scanning

## Public API / Key Types
- `PermissionPolicy` algebra (`policy.ts`): `fromRules`, `override`, `restrict`, `fallback`, `empty`; evaluators `evaluate`, `evaluateAny`, `evaluateAll`, `reachableEffects`, `isActionDenied`, `hasDeny`; diagnostics `relevant`, `scopedRules`; helpers `pathActions`, `ignoresCase`, `isUniversalPattern`, and the private `matchLast`/`evaluateRule`/`evaluateAnyRule`/`matchesAny`
- `evaluate`/`evaluateAny` default to `{ effect: "ask" }` when nothing matches; `evaluateAll` folds resources under `deny > ask > allow`; `isActionDenied` is true only when every resource is guaranteed `deny`
- `Permission.evaluate(action, resource, ...rulesets)` (`permission.ts:111`) and `Permission.evaluateAny(action, resources, ...rulesets)` (`:126`) are thin `PermissionPolicy` wrappers over `fromRules` — fork last-match-wins-across-candidates survives the algebra
- `AssertInput` (`permission.ts:35`) — `Omit<Request, "id" | "message">` + optional `id`/`agent` + `candidates?: readonly string[]` (`:38`); candidates fold `resources + candidates` through `evaluateAny` (`decide`, `:223`) while plain lists stay on `evaluateAll`
- `evaluateInput` (`:233`) resolves configured rules (agent + session), returns `{effect, policy}` on a deny, then layers `savedPolicy()` via `fallback`, runs the `permission/evaluate` plugin hook, and settles `ask` through `Unattended`
- `Permission.Interface` (`:138`): `ask`, `assert`, `assertNotDenied`, `allows`, `reply`, `get`, `forSession`, `list`, `nested`, `close`; `nested(call, parent)` remaps a Code Mode call's request row onto its parent (`parents` map)
- `Permission.invocation(context)` (`:42`) — builds `{sessionID, agent, source: {type: "tool", messageID, id}}` from a `Tool.Context`
- Errors: `DeclinedError` (defect tunnel out of `assert`), `CorrectedError` (typed, feedback to the model), `BlockedError` (`rules` from `relevant`), `NotFoundError`

## Dependencies
- In: `schema/permission`, `PermissionSaved`, `PluginHooks` (`permission/evaluate`), `Agent`, `SessionStore`, `Bus`, `Location`, database.
- Out: tools, skills, session runner, server (`permission` route, `form` elicitation).

## Links
- Parent: INDEX.md
