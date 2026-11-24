# Server / Event Feed

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Streams durable and ephemeral events to connected clients over the event route, with bounded subscriber buffers and framing. Does not own event production (Core Bus/events) or event persistence (Core event log).

## Key Paths
- `packages/server/src/event-feed.ts` — `EventFeed.Service` (`@opencode/server/EventFeed`), `frame(event)`, `SubscriberCapacity = 4096`, `SubscriberOverflowError`, `EncodingError`
- `packages/server/src/handlers/event.ts` — event route handler
- `packages/server/src/request-tracing.ts` — `withoutParentSpan`
- `packages/core/src/bus.ts` — upstream source of events
- `packages/schema/src/server-event.ts`, `event-log.ts`, `event-manifest.ts`
- `packages/schema/src/mcp-event.ts` — `McpEvent.ExperimentalEvent` (ephemeral MCP Events subscription push; at-least-once delivery, dedupe on `id`/`eventId`)

## Public API / Key Types
- `EventFeed.Service`, `EventFeed.frame(event: OpenCodeEvent)`, `EventFeed.Error`
- `EventFeed.layer` / `EventFeed.make`

## Notes
- Event replay ownership is separate from clustered Session execution ownership (AGENTS.md "Session Core").
- `event-manifest.ts` composes the served inventory; `Job.Event.Definitions` and `McpEvent.ExperimentalEvent` were added to it in the v2.4.1 merge.

## Dependencies
- In: Core `Bus`, event schemas.
- Out: `handlers/event.ts`, client event streams (`@opencode/client`), TUI/app.

## Links
- Parent: INDEX.md
