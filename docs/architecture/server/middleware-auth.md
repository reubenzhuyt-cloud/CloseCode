# Server / Middleware & Auth

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns request-scoped middleware and authentication: location injection, form/session location resolution, schema-error and defect shaping, CORS, the auth/session-cookie model, and device pairing. Does not own handler logic (handlers.md).

## Key Paths
- `packages/server/src/middleware/` — `authorization.ts`, `defect-response.ts`, `form-location.ts`, `schema-error.ts`, `session-location.ts`
- `packages/server/src/location.ts` — `LocationMiddleware` (provides `LocationServices`)
- `packages/server/src/auth.ts` — `ServerAuth` (`Config`, `required`, `authorized`, `issueSession`, `verifySession`, `sessionCookieName`, `SESSION_TTL_SECONDS = 30 days`)
- `packages/server/src/pairing.ts` — `ServerPairing.Service` (device pairing)
- `packages/server/src/cors.ts` — `CorsConfig`, `isAllowedCorsOrigin`, `isAllowedRequestOrigin`
- `packages/server/src/middleware/defect-response.ts` — `defectResponseLayer` (`:12`): replaces only Effect's empty 500 body with `UnknownError` (a storage reason, or an `err_<id>` ref logged with the cause). Every response Effect already answers keeps itself

## Public API / Key Types
- `LocationMiddleware`, `FormLocationMiddleware`, `SessionLocationMiddleware`
- `ServerAuth.issueSession` / `verifySession` / `authorized`, `ServerAuth.Config`
- `ServerPairing.Service`, `isAllowedCorsOrigin(input, opts)`, `defectResponseLayer`

## Notes
- `FormLocationMiddleware` contains a temporary `sessionID === "global"` MCP-elicitation sentinel; do not reuse that sentinel with general session APIs (see `packages/server/src/api.ts`).
- Protocol's Authorization + SchemaError middleware wrap the whole API; concrete middleware keys are injected by Server.
- The machine link (`MACHINE_LINK_PATH`, `authorization.ts:101`) bypasses the server password only for a WebSocket upgrade: a worker holding the password could call the whole API, so the link authenticates with its own Noise handshake. Every other request to that path is authorized like the rest.

## Dependencies
- In: `core` (Location/Session services), `protocol/middleware`, `schema`.
- Out: `api.ts`, `routes.ts`, handlers.

## Links
- Parent: INDEX.md
