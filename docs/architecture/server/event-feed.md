# Server / Event Feed

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Streams durable and ephemeral events to connected clients over the event route, with bounded subscriber buffers and framing. Does not own event production (Core Bus/events) or event persistence (Core event log).

## Key Paths
- `packages/server/src/event-feed.ts` — `EventFeed.Service` (`@opencode/server/EventFeed`), `frame(event)`, `SubscriberCapacity = 4096`, `SubscriberOverflowError`, `EncodingError`
- `packages/server/src/handlers/event.ts` — event route handler
- `packages/server/src/request-tracing.ts` — `withoutParentSpan`
- `packages/core/src/bus.ts` — upstream source of events
- `packages/schema/src/server-event.ts`, `event-log.ts`, `event-manifest.ts`

## Public API / Key Types
- `EventFeed.Service`, `EventFeed.frame(event: OpenCodeEvent)`, `EventFeed.Error`
- `EventFeed.layer` / `EventFeed.make`

## Notes
- Event replay ownership is separate from clustered Session execution ownership (AGENTS.md "V2 Session Core").

## Dependencies
- In: Core `Bus`, event schemas.
- Out: `handlers/event.ts`, client event streams (`@opencode/client`), TUI/app.

## Links
- Parent: INDEX.md
