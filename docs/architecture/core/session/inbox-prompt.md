# Session / Inbox & Prompt

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns durable prompt admission and delivery: the inbox lifecycle (admit/queue/steer/cancel/deliver), prompt preparation (attachments, skills, plugin hooks), and synthetic message admission. Durable admission is separate from model execution: admission inserts one durable inbox row before scheduling advisory `SessionExecution.wake`. Does not own the step loop (runner.md).

## Key Paths
- `packages/core/src/session/inbox.ts` — `SessionInbox.Service` (`@opencode/SessionInbox`), `make`, `find`, `projectAdmitted`, `projectDelivered`, `projectCancelled`, `LifecycleConflict`, `Promotable`
- `packages/core/src/session/prompt.ts` — `SessionPrompt.prepare({ session, messageID, input })` (`:34`): awaits plugin activation (`:40`), triggers the `session/prompt` hook, materializes attachments, resolves skills
- `packages/core/src/session/schema.ts` — session info/metadata
- `packages/core/src/session/event.ts` — re-exports `@opencode/schema/session-event` (`session.inbox.enqueued`, `session.inbox.delivered`, …)
- `packages/schema/src/session-inbox.ts`, `prompt.ts`, `prompt-input.ts` — inbox/prompt wire shapes
- `packages/core/src/session/sql.ts` — `SessionInboxTable`

## Public API / Key Types
- `SessionInbox.Service`: `admit`, `admitCompaction`, `reconcile`, `list`, `cancel`, `steer`, `queue`, plus projections `projectAdmitted`/`projectDelivered`/`projectCancelled`
- `SessionInbox.Item`, `SessionInbox.UserPayload`, `SessionInbox.SyntheticPayload`, `SessionInbox.Delivery`, `SessionInbox.Promotable`
- `SessionPrompt.prepare` → `SessionInbox.Item`; `MAX_ATTACHMENT_BYTES = 20 MiB`

## Behavior Notes (AGENTS.md)
- Prompts steer by default. At safe step boundaries steered compaction takes priority up to the first steered move control; otherwise steers retain enqueue order at idle, and exactly one queued item delivers before the runner reevaluates.
- Reusing a user/synthetic inbox ID is idempotent when Session and type match; cross-session/type reuse fails. `session_inbox` stores only unconsumed work.

## Dependencies
- In: `Bus`, `Database`, `FSUtil`, `Instance`, `Image`, `Mime`, `Plugin`, `Skill`, `schema/session-inbox`.
- Out: `Session.make`, `SessionExecution`, `SessionRunner` (delivery), server (`session` route).

## Links
- Parent: INDEX.md
