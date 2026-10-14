# Server / HTTP Server

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Assembles and runs the HTTP server: route table, handler layer, HTTP app, process lifecycle, service-status reporting, pairing/auth config, CORS, and the workerd (Cloudflare) adapter. Does not own handler business logic (handlers.md) or middleware (middleware-auth.md).

## Key Paths
- `packages/server/src/api.ts` — `Api = makeDefaultApi({ locationMiddleware: LocationMiddleware, formLocationMiddleware, sessionLocationMiddleware })` (`:6`)
- `packages/server/src/routes.ts` — `createRoutes`, `createEmbeddedRoutes`
- `packages/server/src/handlers.ts` — `handlers` layer merging all handler layers
- `packages/server/src/fetch.ts` — `ServerFetch.make(options, boot)` HTTP app
- `packages/server/src/process.ts` — `ServerProcess.start` lifecycle (`Lifecycle`, `Transform`)
- `packages/server/src/options.ts` — `ServerOptions` schema
- `packages/server/src/service-status.ts` — `Status.Service` (`@opencode/...`) state reporting
- `packages/server/src/server-info.ts` — `ServerInfo.Service`, `connectionURLs`, `layer(urls, tmp, app)`
- `packages/server/src/pty-environment.ts`, `request-tracing.ts`, `fetch.ts`
- `packages/server/src/workerd.ts` — `ServerWorkerd.create(options)`, `serverOptions`, `replacements`

## Public API / Key Types
- `Api` (HttpApi), `createRoutes`, `createEmbeddedRoutes`
- `ServerProcess.start`, `ServerFetch.make`, `ServerOptions`
- `Status.Service` for `opencode service status`, consumed by CLI `dev:live`

## Dependencies
- In: `core`, `protocol`, `schema`, `util`, `@opencode/simulation`.
- Out: `cli` (hosts server), `sdk` (workerd/process embedding).

## Links
- Parent: INDEX.md
