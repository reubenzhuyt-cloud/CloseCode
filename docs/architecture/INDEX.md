# Architecture Index

> Router only. Open the area folder you need; never read this as content.

| Area | Covers | Folder |
|------|--------|--------|
| foundations | Shared leaf primitives: serializable schema contracts, utilities, database layer | foundations/INDEX.md |
| protocol | HTTP API contract (HttpApi groups + middleware) and the generated client surface | protocol/INDEX.md |
| core | Domain runtime: session engine, tools, plugins, config, filesystem, permissions, machines, automation | core/INDEX.md |
| server | HTTP server, route handlers, auth/middleware, event feed, API codegen | server/INDEX.md |
| client | Headless client runtime, SDK composition, CLI host | client/INDEX.md |
| ui | TUI, web/desktop app, shared UI kit/theme, Electron desktop | ui/INDEX.md |
| ai | Provider/LLM layer, confined code execution, diagram/LaTeX renderers | ai/INDEX.md |
| platform | Plugin packages, simulation, HTTP recorder, native CLI, data/stats product, deployed services and tooling | platform/INDEX.md |

## Layering (from AGENTS.md)

Runtime dependencies flow **Schema → Core/Protocol → Server**. Client runtime code may depend on Schema and Protocol but **never Core or Server**; `sdk` composes Client, Core, and Server. `tui` additionally depends on Core for simulation/dev tooling.
