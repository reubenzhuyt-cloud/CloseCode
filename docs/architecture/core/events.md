# Core / Events

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the durable/ephemeral event model and its persistence: event definitions/manifests, sequencing, the append-only event log, and projection. Does not own per-domain projections (those live with each domain's `sql.ts`) nor transport (Server streams events).

## Key Paths
- `packages/schema/src/event.ts` — `Definition`, `durable`, `ephemeral`, `versionedType`, `inventory`, `latest`
- `packages/schema/src/event-manifest.ts`, `durable-event-manifest.ts`, `event-log.ts` — manifest + log shapes; the served inventory composes every domain's `Event.Definitions` (including `Job.Event.Definitions` and `McpEvent.ExperimentalEvent`)
- `packages/schema/src/*-event.ts` — per-domain event definitions (`session-event`, `location-event`, `mcp-event`, `lsp-event`, `vcs-event`, `worktree-event`, `server-event`, `tui-event`, `installation-event`, `workspace-event`, `session-status-event`, `session-compaction-event`)
- `packages/core/src/bus.ts` — runtime publish/subscribe + sequence reservation
- `packages/core/src/event-logger.ts` — durable log writing
- `packages/core/src/event/sql.ts` — event log table
- `packages/core/src/session/projector.ts` — projects durable events into read-model rows

## Public API / Key Types
- `Bus.publish`, `Bus.durable` / `Bus.ephemeral`, `Bus.SerializedEvent`
- `SessionEvent`, `LocationEvent`, etc. — domain event unions re-exported from Core
- `SessionEvent.FirstToken` — durable first-token marker on an assistant message
- Durable events record irreducible new facts; read models fold ordered history (see AGENTS.md "Session Core")

## Dependencies
- In: `schema/event*`, database.
- Out: `server` (event feed), `client` (event types), every domain that publishes.

## Links
- Parent: INDEX.md
