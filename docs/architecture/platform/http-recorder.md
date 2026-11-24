# HTTP Recorder (`@opencode/http-recorder`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Records and replays Effect HTTP and WebSocket traffic as deterministic cassettes, with redaction of secrets. Owns the cassette format, matching, replay, and redaction; used by tests and the simulated provider.

## Key Paths
- `packages/http-recorder/src/index.ts`, `api.ts`, `options.ts`, `model.ts`
- `packages/http-recorder/src/cassette/` — `store.ts`, `model.ts`
- `packages/http-recorder/src/http/` — `recorder.ts`, `matching.ts`
- `packages/http-recorder/src/websocket/` — `recorder.ts`, `state.ts`, `model.ts`
- `packages/http-recorder/src/replay/` — `comparison.ts`
- `packages/http-recorder/src/redaction/` — `redactor.ts`, `secrets.ts`
- Consumed as a dev dependency by `core`.

## Public API / Key Types
- Recorder/replay API (`api.ts`), `Options`, cassette model
- Redaction utilities for secrets

## Dependencies
- In: `effect`, `schema`.
- Out: `core` tests/simulation.

## Links
- Parent: INDEX.md
