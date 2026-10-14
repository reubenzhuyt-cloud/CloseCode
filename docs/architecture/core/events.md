# Core / Events

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns the durable/ephemeral event model and its persistence: event definitions/manifests, sequencing, the append-only event log, and projection. Does not own per-domain projections (those live with each domain's `sql.ts`) nor transport (Server streams events).

## Key Paths
- `packages/schema/src/event.ts` — `Definition`, `durable`, `ephemeral`, `versionedType`
- `packages/schema/src/event-manifest.ts`, `durable-event-manifest.ts`, `event-log.ts` — manifest + log shapes
- `packages/schema/src/*-event.ts` — per-domain event definitions (`session-event`, `location-event`, `mcp-event`, `lsp-event`, `vcs-event`, `worktree-event`, `server-event`, `tui-event`, `installation-event`, `workspace-event`, `session-status-event`, `session-compaction-event`)
- `packages/core/src/bus.ts` — runtime publish/subscribe + sequence reservation
- `packages/core/src/event-logger.ts` — durable log writing
- `packages/core/src/event/sql.ts` — event log table
- `packages/core/src/session/projector.ts` — projects durable events into read-model rows

## Public API / Key Types
- `Bus.publish`, `Bus.durable` / `Bus.ephemeral`, `Bus.SerializedEvent`
- `SessionEvent`, `LocationEvent`, etc. — domain event unions re-exported from Core
- Durable events record irreducible new facts; read models fold ordered history (see AGENTS.md "V2 Session Core")

## Dependencies
- In: `schema/event*`, database.
- Out: `server` (event feed), `client` (event types), every domain that publishes.

## Links
- Parent: INDEX.md
