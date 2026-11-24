# Server / HTTP Server

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Assembles and runs the HTTP server: route table, handler layer, HTTP app, process lifecycle, service-status reporting, pairing/auth config, CORS, and the workerd (Cloudflare) adapter. Does not own handler business logic (handlers.md) or middleware (middleware-auth.md).

## Key Paths
- `packages/server/src/api.ts` — `Api = makeDefaultApi({ locationMiddleware: LocationMiddleware, formLocationMiddleware, sessionLocationMiddleware })` (`:6`)
- `packages/server/src/routes.ts` — `createRoutes`, `createEmbeddedRoutes`, `makeRoutes`; `applicationServiceNodes` (`:65`) lists every process-global service node the server starts (automation, blob store, video generation, session search build, machines/identity, file watch); the middleware stack is applied on `HttpApiBuilder.layer` (`:232-241`), with `defectResponseLayer` merged last so it only replaces Effect's bare-500 body
- `packages/server/src/handlers.ts` — `handlers` layer merging all handler layers
- `packages/server/src/fetch.ts` — `ServerFetch.make(options, boot)` HTTP app
- `packages/server/src/process.ts` — `ServerProcess.start` lifecycle (`Lifecycle`, `Transform`)
- `packages/server/src/options.ts` — `ServerOptions` schema
- `packages/server/src/service-status.ts` — `Status.Service` (`@opencode/...`) state reporting
- `packages/server/src/server-info.ts` — `ServerInfo.Service`, `connectionURLs`, `layer(urls, tmp, app)`
- `packages/server/src/range.ts` — `ByteRange` parsing for range requests
- `packages/server/src/content-headers.ts`, `media-uri.ts`, `request-site.ts`, `pty-environment.ts`, `request-tracing.ts`
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
