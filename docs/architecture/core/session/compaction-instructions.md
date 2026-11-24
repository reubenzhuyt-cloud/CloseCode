# Session / Compaction & Instructions

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns oversized-context compaction and Session-scoped instruction state. `SessionCompaction` turns a prepared request into a replacement window via registered native strategies; `SessionInstructions` injects discovered instruction files as durable synthetic messages. Does not own provider-mode decisions, retry policy, overflow recovery, or checkpoint persistence — Core owns those (AGENTS.md "V2 Session Core").

## Key Paths
- `packages/core/src/session/compaction.ts` — `SessionCompaction.Service` (`@opencode/SessionCompaction`), `Editor`, `NativeStrategy`, `Settings`, `AutoInput`, `ManualInput`, `Outcome`, `estimateTokens`
- `packages/core/src/session/instructions.ts` — `SessionInstructions.Service` (`@opencode/SessionInstructions`): `load({ sessionID, paths })`; publishes `session.synthetic` with an instruction-path ledger
- `packages/core/src/session/instruction-state.ts`, `instruction-entry.ts` — `InstructionState`/`InstructionEntry` persistence boundaries
- `packages/core/src/session/system-prompt.ts` — request-assembly system prompt
- `packages/core/src/instruction-discovery.ts` — ambient global/upward-project discovery
- `packages/core/src/session/cwd-instructions.ts` — the per-Session working-directory instruction block
- `packages/schema/src/instruction.ts`, `instruction-entry.ts`, `session-compaction-event.ts`
- `packages/core/src/session/sql.ts` — `InstructionEntryTable`, `InstructionBlobTable`, `InstructionStateTable`

## Public API / Key Types
- `SessionCompaction.Service` (`Editor` registered by plugins; later registrations win), `NativeStrategy`
- `SessionInstructions.Service.load(...)`
- `InstructionState`/`InstructionEntry` — projected boundary-processing source of current/initial values

## Behavior Notes (AGENTS.md)
- A logical step may use generic pre-output retries, one full-context retry after continuation rejection, incomplete-stream continuation, or one overflow-compaction rebuild.
- `session.instructions.updated` stores changed source keys + content hashes; blob values live once in `instruction_blob`. Completed compaction moves the instruction epoch; Session movement retains it; committed revert clears it; forks adopt the parent's newest instruction values.

## Dependencies
- In: `@opencode/ai`, `Bus`, `FSUtil`, `Location`, `SessionStore`, `schema/instruction`.
- Out: `Session.make` (`compact`), `SessionRunner` (history/instructions), server (`session` route).

## Links
- Parent: INDEX.md
