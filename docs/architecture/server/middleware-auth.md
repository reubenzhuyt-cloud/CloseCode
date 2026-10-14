# Server / Middleware & Auth

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns request-scoped middleware and authentication: location injection, form/session location resolution, schema-error shaping, CORS, the auth/session-cookie model, and device pairing. Does not own handler logic (handlers.md).

## Key Paths
- `packages/server/src/middleware/` — `authorization.ts`, `form-location.ts`, `schema-error.ts`, `session-location.ts`
- `packages/server/src/location.ts` — `LocationMiddleware` (provides `LocationServices`)
- `packages/server/src/auth.ts` — `ServerAuth` (`Config`, `required`, `authorized`, `issueSession`, `verifySession`, `sessionCookieName`, `SESSION_TTL_SECONDS = 30 days`)
- `packages/server/src/pairing.ts` — `ServerPairing.Service` (device pairing)
- `packages/server/src/cors.ts` — `CorsConfig`, `isAllowedCorsOrigin`, `isAllowedRequestOrigin`

## Public API / Key Types
- `LocationMiddleware`, `FormLocationMiddleware`, `SessionLocationMiddleware`
- `ServerAuth.issueSession` / `verifySession` / `authorized`, `ServerAuth.Config`
- `ServerPairing.Service`, `isAllowedCorsOrigin(input, opts)`

## Notes
- `FormLocationMiddleware` contains a temporary `sessionID === "global"` MCP-elicitation sentinel; do not reuse that sentinel with general session APIs (see `packages/server/src/api.ts`).
- Protocol's Authorization + SchemaError middleware wrap the whole API; concrete middleware keys are injected by Server.

## Dependencies
- In: `core` (Location/Session services), `protocol/middleware`, `schema`.
- Out: `api.ts`, `routes.ts`, handlers.

## Links
- Parent: INDEX.md
