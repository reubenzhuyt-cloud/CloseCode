# Simulation (`@opencode/simulation`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Record/replay simulation harness for the app and TUI: a simulated backend, frontend driver, and protocol, plus a control server and recording format. Owns deterministic scenario playback; it does not own production server behavior.

## Key Paths
- `packages/simulation/src/index.ts`, `control-server.ts`, `manifest.ts`, `recording.ts`
- `packages/simulation/src/backend/` — `server.ts`, `simulated-provider.ts`, `openai.ts`, `network.ts`
- `packages/simulation/src/frontend/` — `actions.ts`, `renderer.ts`, `semantics.ts`, `simulation.ts`
- `packages/simulation/src/protocol/` — shared simulation protocol
- Exports: `./backend`, `./backend/*`, `./frontend`, `./frontend/*`, `./protocol`, `./recording`
- `packages/protocol/src/simulation.ts` — protocol-side simulation extension

## Public API / Key Types
- Simulation backend server + simulated provider (fake LLM responses)
- Frontend actions/renderer/semantics for driving the UI deterministically

## Dependencies
- In: `schema`, `util`, `client`.
- Out: `server` (dev/test), `tui` (`src/simulation`), app.

## Links
- Parent: INDEX.md
