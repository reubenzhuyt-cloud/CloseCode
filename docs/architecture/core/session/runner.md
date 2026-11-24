# Session / Runner

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Runs one local continuation from already-recorded Session history: drives exactly one logical step (one LLM call) at a time, then decides whether to continue, move, or reload. Owns retry policy, max-steps handling, model transport, and LLM-message projection. Does not own durable history (history-persistence.md) or admission (inbox-prompt.md).

## Key Paths
- `packages/core/src/session/runner/index.ts` — `SessionRunner.Service` (`@opencode/SessionRunner`), `Interface.drain`, `RunError`, `DrainResult` (`Complete` | `Moved` | `Reloaded`), `Continuation`
- `packages/core/src/session/runner/step.ts` — `SessionStep` single-step `Outcome`
- `packages/core/src/session/runner/llm.ts` — LLM step node
- `packages/core/src/session/runner/retry.ts` — `isRetryable`, retry `policy`, transient classification
- `packages/core/src/session/runner/max-steps.ts` — `MAX_STEPS_PROMPT`
- `packages/core/src/session/runner/model.ts` — `SessionRunnerModel` errors (`ModelNotSelectedError`, resolver error aliases)
- `packages/core/src/session/runner/to-llm-message.ts` — transcript → LLM messages
- `packages/core/src/session/runner/publish-llm-event.ts`, `prompt/system.txt`
- `packages/core/src/session/runner/live-tool-metadata.ts` — live tool metadata projected into the step
- `packages/core/src/session/model-transport.ts` — `SessionModelTransport.Service` (WebSocket connector/attachments)
- `packages/core/src/session/model-request.ts` — `SessionModelRequest` prepared request, tool execution, unsupported-part/bound-image checks
- `packages/core/src/session/context.ts` — `SessionContext.Service` (`select` resolves the Session, agent, instructions, and one `Permission.Policy` feeding the tool snapshot/skills; `load` adds the model and active history)

## Public API / Key Types
- `SessionRunner.Interface.drain({ sessionID, force, continuation?, promotable? })`
- One `llm.stream(request)` per Physical Attempt; reload projected history before durable continuation (AGENTS.md "V2 Session Core")
- Generic retries retain the logical step number and do not consume another agent-step allowance

## Dependencies
- In: `@opencode/ai`, tools, permissions, `SessionRunnerModel`/`AISDK`, `SessionHistory`, `SessionContext`, instructions.
- Out: `SessionExecution` (invokes runner per drain).

## Links
- Parent: INDEX.md
