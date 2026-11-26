# Session / Execution

> last-verified: 754ee05a22 @ 2026-11-26

## Responsibility
`SessionExecution` is the process-global, Session-ID-based coordinator. It snapshots/owns process-local execution, coalesces wakeups, joins resumes, and interrupts active work. It owns the write-ahead execution claim used for restart recovery. It is **not** clustered ownership, fencing, or an exactly-once guarantee.

## Key Paths
- `packages/core/src/session/execution.ts` — `SessionExecution.Service` (`@opencode/SessionExecution`), `terminal(exit, reason)`, `layer`, `node`, `noopLayer`
- `packages/core/src/session/execution/restart.ts` — startup recovery of claimed top-level sessions
- `packages/core/src/session/execution/subagent-report.ts` — subagent job reports routed to their owning Session; `SILENT_METADATA_KEY`, `postFinishSilent`, `clearPostFinishMark`
- `packages/core/src/session/run-coordinator.ts` — `SessionRunCoordinator.make({...})`: joins explicit same-session resumes, coalesces prompt wakeups, allows different sessions to run concurrently
- `packages/core/src/session/runner/index.ts` — the runner invoked per drain

## Public API / Key Types
- `SessionExecution.Interface`: `active`, `isActive(id)`, `resume(id)`, `wake(id)`, `interrupt(id, {resume, reason, awaitSettlement})`, `awaitIdle(id)`
- `terminal(exit, reason?)` → `{type: "succeeded" | "interrupted" | "failed"}`; interrupt reasons `user` | `shutdown` | `inactivity`
- Placement is discovered through `SessionStore` + `LocationServiceMap.get(session.location)` only when a drain starts; no layer takes a Session ID

## Behavior Notes (AGENTS.md)
- Startup recovery resumes claimed top-level sessions with durable per-execution attempt accounting.
- Terminal completion/failure/user interruption releases the claim; shutdown interruption and process death preserve it.

## Settlement silence (fork)
`subagent-report.ts` `prepare(...)` returns the settlement's `commit`/`deliver`. A host may mark one round of a child silent by setting session metadata `post-finish` → `{silent: true}` (`SILENT_METADATA_KEY`); `postFinishSilent` reads it (`:144,227`).
- Silent branch (`:146-147`): `jobState.mode === "none"` is required in **both** disjuncts, so a background-mode Job still reports even when marked. Cancelled periods report normally; `session.execution.interrupted` with reason `shutdown` never reaches `prepare` (`execution.ts:161-165`).
- A silent settlement is *not* a no-op: `commit` still runs `store.release(sessionID)` and clears the mark, and `deliver` is `Effect.void` — so no outbox row and no parent wake, but the claim is released normally.
- The mark is **single-use**: `clearPostFinishMark` is one flat `json_remove(metadata, '$."post-finish"')` that pins `time_updated`, executed inside `Bus.publish`'s `BEGIN IMMEDIATE` transaction (`bus.ts:316-317,404,434`) alongside `store.release`. A mark present on the *reporting* path is also cleared there (`:172`), so a stray mark cannot silence a later legitimate report.
- `clearPostFinishMark` resolves `Database.Service` with `Effect.serviceOption` + `Option.getOrThrowWith` (`:238-241`) so a missing service fails the transaction loudly. `serviceOption` is deliberate: `commit` is typed `Effect<void, never, never>`, so a required `yield* Database.Service` would leak `R` into the closure (`tsc` TS2345 at `execution.ts:170`).
- Consequence: `Session.Metadata` is documented as host-opaque (`schema/src/session-metadata.ts`), but core now reads and writes this one key, and it is momentarily visible in `Session.Info.metadata`.
- Accepted limitations: the mark silences whichever settlement commits next, not a specific admitted round (a parent-initiated follow-up landing in between would be silenced); and `ctx.session.update` replaces the whole public metadata map, so a plugin read-modify-write can drop a concurrent public key (core's private `$opencode_experimental_cwd` survives — `projector.ts:991-993` re-reads and re-adds it).

## Dependencies
- In: `Bus`, `Database`, `Job`, `Instance`, `SessionStore`, `SessionRunCoordinator`, `SessionRunner`.
- Out: `Session.make`, server (`session` route interrupt/resume), sdk.

## Links
- Parent: INDEX.md
