# Session / Execution

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
`SessionExecution` is the process-global, Session-ID-based coordinator. It snapshots/owns process-local execution, coalesces wakeups, joins resumes, and interrupts active work. It owns the write-ahead execution claim used for restart recovery. It is **not** clustered ownership, fencing, or an exactly-once guarantee.

## Key Paths
- `packages/core/src/session/execution.ts` — `SessionExecution.Service` (`@opencode/SessionExecution`), `terminal(exit, reason)`, `layer`, `node`, `noopLayer`
- `packages/core/src/session/execution/restart.ts` — startup recovery of claimed top-level sessions
- `packages/core/src/session/run-coordinator.ts` — `SessionRunCoordinator.make({...})`: joins explicit same-session resumes, coalesces prompt wakeups, allows different sessions to run concurrently
- `packages/core/src/session/runner/index.ts` — the runner invoked per drain

## Public API / Key Types
- `SessionExecution.Interface`: `active`, `isActive(id)`, `resume(id)`, `wake(id)`, `interrupt(id, {resume, reason, awaitSettlement})`, `awaitIdle(id)`
- `terminal(exit, reason?)` → `{type: "succeeded" | "interrupted" | "failed"}`; interrupt reasons `user` | `shutdown` | `inactivity`
- Placement is discovered through `SessionStore` + `LocationServiceMap.get(session.location)` only when a drain starts; no layer takes a Session ID

## Behavior Notes (AGENTS.md)
- Startup recovery resumes claimed top-level sessions with durable per-execution attempt accounting.
- Terminal completion/failure/user interruption releases the claim; shutdown interruption and process death preserve it.

## Dependencies
- In: `Bus`, `Database`, `Job`, `Instance`, `SessionStore`, `SessionRunCoordinator`, `SessionRunner`.
- Out: `Session.make`, server (`session` route interrupt/resume), sdk.

## Links
- Parent: INDEX.md
