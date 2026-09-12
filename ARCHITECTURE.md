# OpenCode — Architecture Baseline

> Generated baseline architecture survey produced from a multi-round read-only code review (2026-09-12). `path:line` anchors reflect the code at this commit and may drift as the code evolves.

## 1. High-Level Overview

OpenCode is a Bun + TypeScript monorepo (Bun workspaces + Turborepo) with 31 packages. It is an AI-powered development tool whose local runtime is an Effect-based service graph, persisted in SQLite via a custom Drizzle-to-Effect adapter. It ships a terminal UI, a SolidJS web app, an Electron desktop app, an HTTP server, generated clients/SDKs, a provider-neutral LLM abstraction, a sandboxed code-execution engine, and a cloud surface (Cloudflare Workers/Durable Objects/R2, PlanetScale MySQL, AWS S3 Tables/Firehose/Athena/ECS).

### 1.1 Package Map

| Package | Role |
|---|---|
| `@opencode-ai/schema` | Browser-safe wire/storage contracts (Schema leaf) |
| `@opencode-ai/protocol` | Authoritative HttpApi definition + middleware placement |
| `@opencode-ai/server` | Concrete HttpApi, handlers, middleware, routes |
| `@opencode-ai/client` | Generated Promise + Effect clients from Protocol HttpApi |
| `@opencode-ai/sdk-next` | Scoped embedded in-process host (Client+Core+Server) |
| `@opencode-ai/sdk` | Legacy OpenAPI/@hey-api generated SDK |
| `@opencode-ai/core` | Domain engine: sessions, tools, context, events, plugins, PTY |
| `@opencode-ai/llm` | Provider-neutral LLM route/protocol/transport/auth abstraction |
| `@opencode-ai/codemode` | Effect-native confined JS execution over schema tools |
| `@opencode-ai/plugin` | Public plugin API (v1 + v2 effect/promise) |
| `@opencode-ai/tui` | Terminal UI (OpenTUI + SolidJS) |
| `@opencode-ai/app` | Web app (SolidJS + Vite + Tailwind) |
| `@opencode-ai/desktop` | Electron 42 desktop wrapper |
| `@opencode-ai/ui` | Generic UI primitives |
| `@opencode-ai/session-ui` | Session/chat UI components |
| `@opencode-ai/web` | Astro/Starlight docs site |
| `packages/console/*` | Cloud console (SolidStart, PlanetScale, Stripe) |
| `packages/stats/*` | Analytics lake (PlanetScale + AWS) |
| `@opencode-ai/enterprise` | Team management app |
| `@opencode-ai/function` | Cloudflare Worker API + Durable Objects |
| `@opencode-ai/slack` | Slack bot integration |
| `@opencode-ai/cli` | Preview CLI (`lildax`) |
| `opencode` | Main CLI/runtime entry package |
| `@opencode-ai/effect-drizzle-sqlite` | Generic Drizzle↔Effect SQLite adapter |
| `@opencode-ai/effect-sqlite-node` | Node `node:sqlite` Effect client |
| `@opencode-ai/http-recorder` | Record/replay HTTP/WS cassettes for tests |
| `@opencode-ai/httpapi-codegen` | SDK Contract IR + Promise/Effect emitters |
| `@opencode-ai/script` | Shared version/release helpers |
| `@opencode-ai/storybook` | Component workshop |

### 1.2 Dependency Layering

Strict direction: `schema → core/protocol → server`. `client` runtime depends only on `schema` + `protocol`. `sdk-next` composes `client` + `core` + `server`. UI packages must not import `server` or core domain modules.

```
@opencode-ai/schema          (no internal deps)
       ↑
@opencode-ai/protocol        (depends on schema)
       ↑
@opencode-ai/server          (depends on protocol + core)
       ↑
@opencode-ai/client          (runtime: schema + protocol only)
@opencode-ai/sdk-next         (client + core + server)
@opencode-ai/plugin           (depends on sdk — legacy published SDK)
```

The client import boundary is enforced by a bundler-based test (`packages/client/test/import-boundaries.test.ts:13-30`): the root entrypoint must include zero `effect`/`schema`/`protocol`/`core`/`server` inputs; the `/effect` entrypoint may include `effect`/`schema`/`protocol` but never `core`/`server`.

=====================================================================

# Core Runtime

## Overview

The core runtime (`packages/core`) is the domain engine of the OpenCode monorepo. It owns session lifecycle, tool execution, system context, event sourcing, plugin hosting, and PTY management. The package is an Effect-based service graph where Location-scoped services are lazily instantiated per workspace directory and global services are shared across the process.

**Critical architectural fact**: Two parallel session execution stacks coexist. The **V1 stack** (`packages/opencode/src/session/`) is the ACTIVE execution path for all production surfaces (HTTP server, TUI, CLI). The **V2 stack** (`packages/core/src/session/runner/`) is WIRED into the server's layer graph but its prompt entry point (`SessionV2.prompt()`) is NEVER CALLED by any production handler. The V2 stack's durable event infrastructure (projector, input admission, context epochs) IS active and shared by both stacks.

## Package Layout

`packages/core/src/` contains ~82 top-level modules organized into these domains:

| Domain | Key Files | Purpose |
|--------|-----------|---------|
| Session | `session.ts`, `session/` (20 files) | Session CRUD, prompt admission, execution coordination, runner, history, projection |
| Tool | `tool/` (20 files) | Tool definition, registry, 12 built-in tools, output bounding |
| System Context | `system-context/` (3 files) | Typed refreshable context sources, registry, built-in environment/date |
| Event | `event.ts` (638 lines) | Durable event store with pub/sub, projection, aggregate read, replay |
| Plugin | `plugin.ts`, `plugin/` (13 files) | Plugin lifecycle, host, internal boot, skill/agent/command/provider plugins |
| PTY | `pty/` (6 files) | Transport-free PTY abstraction, protocol, tickets |
| Effect Infra | `effect/` (9 files) | Node graph compilation, layer scoping (global vs location), runtime |
| Location | `location.ts`, `location-services.ts`, `location-service-map.ts` | Multi-workspace topology, per-directory service instantiation |
| Model/Provider | `model.ts`, `provider.ts`, `catalog.ts` | Model resolution, provider registry, catalog |
| Permission | `permission.ts`, `policy.ts` | Authorization, permission rulesets |

**Dependency edges** (runtime): `core` → `schema`, `llm`, `plugin`, `effect-drizzle-sqlite`, `effect-sqlite-node`, `drizzle-orm`, 17 AI SDK provider packages, `@parcel/watcher`, `@lydell/node-pty`, `bun-pty`. Core is intentionally heavy — it is the monolithic runtime, not a lightweight foundation.

## Session Lifecycle

### ACTIVE Path: V1 Prompt Loop

The V1 stack executes all production prompts. The call chain over HTTP:

```
HTTP POST /session/:id/prompt
  → handlers/session.ts:300 — promptSvc.prompt({...})
  → SessionPrompt.Service (@opencode/SessionPrompt)
     prompt.ts:1052-1071 — prompt():
       1. sessions.get(sessionID)                    line 1055
       2. revert.cleanup(session)                    line 1056
       3. createUserMessage(input)                   line 1057
       4. loop({ sessionID })                        line 1070
          → prompt.ts:1343-1347 — loop():
            state.ensureRunning(sessionID, ..., runLoop(sessionID))
          → prompt.ts:1081-1329 — runLoop(): while(true) loop
            1. status.set(sessionID, "busy")          line 1089
            2. MessageV2.filterCompactedEffect(...)   line 1092
            3. MessageV2.latest(msgs)                 line 1096
            4. Check finish conditions                line 1111-1130
            5. title() on first step                  line 1133-1139
            6. getModel(providerID, modelID)          line 1141
            7. Handle subtask/compaction/overflow     line 1142-1168
            8. agents.get(lastUser.agent)             line 1170
            9. processor.create({assistantMessage, sessionID, model})  line 1213-1218
           10. SessionTools.resolve({agent, session, model, processor, ...})  line 1226-1241
           11. SystemPrompt: skills + environment + instructions + mcp  line 1257-1269
           12. handle.process({messages, tools, model, system, ...})  line 1272-1286
               → SessionProcessor.process → LLM.stream → tool loop
           13. Check result: "stop" | "compact" | "continue"  line 1319-1328
```

Key files:
- `packages/opencode/src/session/prompt.ts:1052` — V1 prompt entry
- `packages/opencode/src/session/prompt.ts:1081` — V1 runLoop (the `while(true)` tool loop)
- `packages/opencode/src/session/processor.ts:79` — SessionProcessor handles one provider turn
- `packages/opencode/src/session/tools.ts:41` — SessionTools.resolve builds AI SDK tool objects

### DORMANT Path: V2 Runner

The V2 runner is fully implemented but never invoked in production:

```
SessionV2.prompt(input)                    session.ts:360
  → SessionInput.admit(db, events, {...})  session.ts:368 → input.ts:41
  → execution.wake(sessionID)              session.ts:382
    → coordinator.wake(key)                run-coordinator.ts:81
      → drain(key, force)                  local.ts:17
        → runner.run({sessionID, force})   runner/llm.ts:390
          → runTurn(sessionID, promotion, step)  llm.ts:376
            → llm.stream(request)           llm.ts:239
            → tool settlement               llm.ts:257-278
```

**`SessionV2.prompt()` is defined at `session.ts:360` but called ONLY by a core test (`test/session-prompt.test.ts:101`). No production handler, CLI command, or TUI code invokes it.**

### What V2 IS Used For

The V2 infrastructure IS active for shared concerns:

1. **Event system** (`event.ts:150`): `EventV2.Service` is the canonical event bus. Both V1 and V2 publish to it. `handlers/event.ts:4` imports `EventV2` for SSE streaming.

2. **Session projector** (`session/projector.ts:1`): Subscribes to ~25 event types and projects them into SQLite. Shared by both stacks. Wired at `server.ts:236`.

3. **Input admission** (`session/input.ts:41`): `SessionInput.admit()` records durable prompt entries. Used by V2's `SessionV2.prompt()` path (currently dormant).

4. **Context epochs** (`session/context-epoch.ts:23`): Manages system context snapshots per session. Used by V2 runner (currently dormant).

5. **Session CRUD**: `SessionV2.NotFoundError` is used by the control-plane handler (`handlers/control-plane.ts:31`).

## SessionV2 Wiring in Server

The server wires V2 services at `server.ts:298-303`:

```typescript
AppNodeBuilderV1.build(SessionV2.node, [
  [LocationServiceMap.node, locationServiceMapV2],
  [SessionExecution.node, SessionExecutionLocal.node],
])
```

This makes `SessionV2.Service` available in the layer graph with `SessionExecutionLocal` providing the real `SessionExecution` implementation. However, **no handler yields `SessionV2.Service`**. The V2 service is instantiated but unused.

### `SessionExecution` Implementation

- `SessionExecution.Service` is an interface (`execution.ts:9-18`) with `active`, `resume`, `wake`, `interrupt`.
- `SessionExecution.node` is `LayerNode.unbound` (`execution.ts:23`) — no default implementation.
- `SessionExecutionLocal.node` (`local.ts:40-44`) provides the real implementation using `SessionRunCoordinator`.
- The `noopLayer` (`execution.ts:26-33`) exists for testing but is NOT used in the live server path.
- **Verdict**: `SessionExecution` IS implemented via `SessionExecutionLocal` in the server layer, but its methods are never called because nothing invokes `SessionV2.prompt()`.

### `SessionRunCoordinator` in Live Path

- `SessionExecutionLocal` creates a `SessionRunCoordinator` at `local.ts:16`.
- The coordinator serializes per-session execution with `run`, `wake`, `interrupt`, `active`.
- **Verdict**: The coordinator IS instantiated in the live path, but it is IDLE — no keys are ever registered because `wake()` is never called.

## System Context

### Algebra (`system-context/index.ts`)

The system context models independently refreshable typed sources:

- **`Source<A>`** (`index.ts:32-39`): `{ key, codec, load, baseline, update, removed? }`. Each source knows how to observe, compare, and render one value.
- **`SystemContext`** (`index.ts:44-46`): Opaque carrier (symbol-typed array of `PackedSource`). Created via `make(source)` or `combine(values)`.
- **`Snapshot`** (`index.ts:56-57`): `Record<Key, SourceSnapshot>` — durable comparison state per source.
- **`Generation`** (`index.ts:59-62`): `{ baseline: string, snapshot: Snapshot }` — immutable baseline + durable snapshot.

Key functions:
- `make<A>(source)` (`index.ts:135`): Closes typed source into composable context.
- `combine(values)` (`index.ts:176`): Merges contexts, rejects duplicate keys.
- `initialize(value)` (`index.ts:198`): Creates baseline + snapshot. Returns `InitializationBlocked` if any source is unavailable.
- `reconcile(value, previous)` (`index.ts:218`): Compares current values with previous snapshot. Returns `Unchanged | Updated | ReplacementReady | ReplacementBlocked`.
- `replace(value, previous)` (`index.ts:283`): Full replacement or block.

### Registry (`system-context/registry.ts`)

`SystemContextRegistry.Service` (`registry.ts:17`) is Location-scoped. Producers register `{ key, load }` entries with scope-based cleanup. `load()` combines all registered entries.

### Built-ins (`system-context/builtins.ts`)

Registers two sources:
- `core/environment` (`builtins.ts:26`): Working directory, workspace root, git status, platform.
- `core/date` (`builtins.ts:35`): Current date string.

### Context Epochs (`session/context-epoch.ts`)

Per-session system context persistence:
- `initialize(db, context, sessionID)` (`context-epoch.ts:23`): Creates initial epoch if none exists. Inserts into `SessionContextEpochTable`.
- `prepare(db, events, context, sessionID)` (`context-epoch.ts:31`): Reconciles or replaces epoch. On `Updated`, publishes `SessionEvent.ContextUpdated` which creates a system message via the projector.
- Compaction triggers full replacement: if `compaction.seq > stored.baseline_seq` (`context-epoch.ts:59`), calls `SystemContext.replace()` instead of `reconcile()`.

**Status**: DORMANT — `SessionContextEpoch.initialize` and `prepare` are called only by the V2 runner (`runner/llm.ts:183,198`), which is never invoked.

## Tools

### Tool Definition (`tool/tool.ts`)

`Tool.make(config)` (`tool.ts:71`) creates an opaque tool value. Config: `{ description, input, output, structured?, execute, toModelOutput?, toStructuredOutput? }`. Runtime stored in `WeakMap<AnyTool, Runtime>`.

- `definition(name)` (`tool.ts:79`): Returns `ToolDefinition` (cached per name).
- `settle(call, context)` (`tool.ts:91`): Decodes input → executes → encodes output → builds `ToolOutput`.
- `withPermission(tool, permission)` (`tool.ts:139`): Decorates tool with permission action.

### Registry (`tool/registry.ts`)

`ToolRegistry.Service` (`registry.ts:40`) is Location-scoped.
- `register(tools)` (`registry.ts:85`): Scoped registration. Latest same-name registration wins.
- `materialize(permissions)` (`registry.ts:106`): Returns `{ definitions, settle }`. Filters wholly-denied tools.

Settlement (`registry.ts:50-82`): Looks up registration → checks staleness → calls `settle(tool, call, context)` → bounds output via `ToolOutputStore.bound()`.

### Built-in Tools (`tool/builtins.ts`)

12 shipped tools (`builtins.ts:31-47`): `ApplyPatchTool`, `BashTool`, `EditTool`, `GlobTool`, `GrepTool`, `QuestionTool`, `ReadTool`, `SkillTool`, `TodoWriteTool`, `WebFetchTool`, `WebSearchTool`, `WriteTool`.

### Tool Output Store (`tool-output-store.ts`)

`ToolOutputStore.Service` (`tool-output-store.ts:48`) is Location-scoped. Constants: `MAX_LINES=2000`, `MAX_BYTES=50KB`, `RETENTION=7 days`.
- `bound(input)` (`tool-output-store.ts:138`): If output exceeds limits, writes full content to file, returns truncated preview with marker.
- `cleanup()` (`tool-output-store.ts:176`): Removes files older than retention. Runs hourly via `cleanupNode`.

### V1 vs V2 Tool Paths

**V1 (ACTIVE)**: `SessionTools.resolve()` (`opencode/session/tools.ts:41`) builds AI SDK `tool()` objects. Tools are executed via AI SDK's tool execution mechanism, with results persisted through V1's `SessionProcessor`.

**V2 (DORMANT)**: `ToolRegistry.materialize()` (`core/tool/registry.ts:106`) returns canonical `ToolDefinition`s and a `settle` function. Tools are settled via `toolMaterialization.settle()` in the V2 runner (`runner/llm.ts:259`).

## Events & Projection

### Event System (`event.ts`)

`EventV2.Service` (`event.ts:150`) provides:
- `publish(definition, data, options?)` (`event.ts:127`): Publishes event. Durable events write to SQLite in a transaction, assign sequence numbers, and run projectors synchronously.
- `subscribe(definition)` (`event.ts:132`): Returns typed `Stream`.
- `project(definition, projector)` (`event.ts:137`): Registers a projector for an event type.
- `durable({ aggregateID, after? })` (`event.ts:134`): Returns durable event stream for an aggregate.
- `replay(event, options?)` (`event.ts:138`): Replays a serialized event.

Durable events use `EventSequenceTable` for per-aggregate sequencing and `EventTable` for storage. Projectors run inside the same transaction as the event write (`event.ts:237-279`).

### Session Projector (`session/projector.ts`)

`SessionProjector` (`projector.ts:210-453`) subscribes to ~25 event types and projects into:
- `SessionTable` — session metadata, cost, tokens, revert state
- `SessionMessageTable` — V2 session messages (user, assistant, system, shell, compaction, etc.)
- `SessionInputTable` — admitted/promoted inputs
- `MessageTable`, `PartTable` — V1 message/part storage

The projector uses `SessionMessageUpdater` (`projector.ts:132-188`) as an adapter pattern. Each event type maps to specific insert/update operations.

## Plugins & Skills

### Plugin Service (`plugin.ts`)

`PluginV2.Service` (`plugin.ts:29`) is Location-scoped:
- `add(id, effect)` (`plugin.ts:43`): Loads plugin in child scope. Detects cycles via `loading` Set.
- `remove(id)` (`plugin.ts:85`): Closes scope.
- `wait(id)` (`plugin.ts:100`): Awaits plugin load (Deferred-based).

### Plugin Host (`plugin/host.ts`)

`PluginHost.make(plugin)` (`plugin/host.ts:20`) constructs the `PluginContext` interface. Provides access to: `agent`, `aisdk`, `catalog`, `command`, `integration`, `plugin`, `reference`, `skill`.

### Internal Plugin Boot (`plugin/internal.ts`)

Boots 12+ internal plugins (`internal.ts:108-123`): `ConfigReferencePlugin`, `AgentPlugin`, `CommandPlugin`, `SkillPlugin`, `ModelsDevPlugin`, `ConfigAgentPlugin`, `ConfigCommandPlugin`, `ConfigSkillPlugin`, `ProviderPlugins`, `ConfigExternalPlugin`, `ConfigProviderPlugin`, `VariantPlugin`.

### Skill Discovery (`skill/discovery.ts`)

`SkillDiscovery.Service` (`discovery.ts:69`) pulls skills from URLs. Fetches `index.json`, downloads files with version-aware caching. Path traversal protection via `isSafeSegment`/`isSafeRelativePath` (`discovery.ts:15-53`).

### Skill Guidance (`skill/guidance.ts`)

`SkillGuidance.Service` (`guidance.ts:38`) produces `SystemContext` from available skills. Renders skill list as XML for system prompt (`guidance.ts:16-32`).

## PTY

### Interface (`pty/pty.ts`)

Transport-free types (`pty.ts:1-25`):
- `Opts`: `{ name, cols?, rows?, cwd?, env? }`
- `Proc`: `{ pid, onData, onExit, write, resize, kill }`

### Implementations

- **Bun** (`pty/pty.bun.ts:6`): Uses `bun-pty`.
- **Node** (`pty/pty.node.ts:6`): Uses `@lydell/node-pty`. Windows: `useConptyDll: true`.

### Protocol (`pty/protocol.ts`)

Wire protocol for WebSocket transports (`protocol.ts:1-37`):
- Outbound: raw UTF-8 terminal chunks. Control frame: `0x00` + UTF-8 JSON `{ cursor }`.
- `REPLAY_CHUNK = 64KB` (`protocol.ts:13`).
- `metaFrame(cursor)` (`protocol.ts:15`): Encodes cursor position.
- `decodeInput(message)` (`protocol.ts`): Decodes client input.

### Tickets (`pty/ticket.ts`)

`PtyTicket.Service` (`ticket.ts:25`) issues/consumes one-time connection tokens:
- `issue(input)` (`ticket.ts:43`): UUID ticket, 60s TTL.
- `consume(input)` (`ticket.ts:48`): Validates ticket matches scope (ptyID, directory, workspaceID).

## Concurrency & Scopes

### Node Graph (`effect/app-node.ts`)

Two scope tags (`app-node.ts:3-6`):
- `global`: Process-wide singleton. Used by `EventV2`, `Database`, `SessionExecution`, `SessionStore`.
- `location`: Per-directory instance. Used by `ToolRegistry`, `SystemContextRegistry`, `SessionRunner`, `PermissionV2`, `PluginV2`.

`makeGlobalNode` and `makeLocationNode` (`app-node.ts:11-12`) create typed nodes with dependency declarations.

### Location Service Map (`location-services.ts`)

`buildLocationServiceMap()` (`location-services.ts:84-112`) creates a `LayerMap` keyed by `Location.Ref`. Each directory gets its own service graph, lazily instantiated with 60-minute idle TTL (`location-services.ts:109`).

### Run Coordinator (`session/run-coordinator.ts`)

`SessionRunCoordinator.make({ drain })` (`run-coordinator.ts:24`) serializes execution per key:
- `run(key)` (`run-coordinator.ts:67`): Starts or joins execution.
- `wake(key)` (`run-coordinator.ts:81`): Sets `pendingWake` flag or starts new drain.
- `interrupt(key)` (`run-coordinator.ts:94`): Sets `stopping`, interrupts owner fiber.
- `settle(key, entry, exit)` (`run-coordinator.ts:51`): On success with `pendingWake`, starts successor. Otherwise cleans up.

### Effect Scoping

All Location-scoped services use `Effect.scoped` or `Effect.addFinalizer` for cleanup. Plugin child scopes are forked from a parent scope (`plugin.ts:58`). The `FiberSet` in the V2 runner (`runner/llm.ts:184`) tracks tool execution fibers for interruption.

## Known Risks

1. **V1/V2 duplication**: Two complete session execution stacks coexist. V1 is active, V2 is dormant but fully wired. The V2 projector and event system ARE shared. This creates maintenance burden and confusion about which code path executes.

2. **V2 runner never tested in production**: `SessionV2.prompt()` is only called by a core test. The full V2 pipeline (admission → coordinator → runner → tool settlement → projection) has never been exercised under real load.

3. **Core is monolithic**: `packages/core` has 17 AI SDK provider packages, native PTY, image processing, and npm internals as runtime deps. Every consumer (server, tui, cli, opencode, enterprise, session-ui, app) transitively pulls all of these.

4. **SessionRunCoordinator idle in production**: The coordinator is instantiated but never has keys registered because `wake()` is never called. This means the V2 interruption and coalescing logic is untested in the live path.

5. **Compaction uses `Effect.die` for control flow**: `runner/llm.ts:223` throws `TurnTransitionError` via `Effect.die` to jump out of the turn logic. This is caught by `catchDefect` in the outer `runTurn`. While intentional, it makes the control flow hard to follow and debug.

## Open Questions

1. **When will V2 replace V1?** The V2 runner is architecturally cleaner (Effect-native, durable events, scoped tools) but the V1 loop has production-hardened MCP, LSP, plugin, and permission integration that V2 lacks.

2. **Is the V2 projector the permanent bridge?** Both stacks share the same projector and event system. Is this the intended long-term architecture, or a migration stepping stone?

3. **Should `core` be split?** The monolithic dependency graph means a UI package pulling `core/util/path` transitively pulls every AI SDK provider. Extracting `core/util`, `core/flag`, `core/installation` into a lightweight `core-shared` package would reduce UI bundle size.

4. **What is the `noopLayer` for?** `execution.ts:26-33` defines a no-op `SessionExecution` layer. It's described as "for callers that only need durable Session recording" but is unused in production. Is it for testing, or for a future partial-migration path?

5. **Are V1's `SessionRunState` and V2's `SessionRunCoordinator` redundant?** V1 uses `SessionRunState` (`opencode/session/run-state.ts`) for concurrency control. V2 uses `SessionRunCoordinator` (`core/session/run-coordinator.ts`). Both serialize per-session execution. Are they intended to merge?

=====================================================================

# Contract, Server & SDK

## Overview

The OpenCode HTTP surface is defined once in `@opencode-ai/protocol` as an Effect `HttpApi`, consumed by three independent code-generation paths that produce structurally identical clients. Schema types flow from `@opencode-ai/schema` through Protocol into Server and Client; Core re-exports Schema values by reference identity. The public API contract is the union of 18 endpoint groups covering sessions, messages, models, providers, permissions, filesystem, commands, skills, events, PTY, questions, references, integrations, credentials, project copies, health, and location.

## Layering Rules

Dependencies flow strictly downward. Violations are enforced by package.json workspace references and tested by bundler-based import-boundary tests.

```
@opencode-ai/schema          (no internal deps)
       ↑
@opencode-ai/protocol        (depends on schema)
       ↑
@opencode-ai/server          (depends on protocol + core)
       ↑
@opencode-ai/client          (runtime: schema + protocol only)
                              (devDeps: core + server + httpapi-codegen for codegen)
@opencode-ai/sdk-next         (depends on client + core + server — embedded host)
@opencode-ai/plugin           (depends on sdk — legacy published SDK)
```

The critical invariant: `@opencode-ai/client` runtime dependencies must never include `core` or `server`. This is enforced by `packages/client/test/import-boundaries.test.ts:13-30`, which bundles both entrypoints (`@opencode-ai/client` and `@opencode-ai/client/effect`) with `bun build --target=browser` and asserts that the metafile contains zero inputs from `packages/core` or `packages/server`.

The `@opencode-ai/client/effect` entrypoint is permitted to import `effect`, `schema`, and `protocol` (`import-boundaries.test.ts:25-27`). The root `@opencode-ai/client` entrypoint must import none of them (`import-boundaries.test.ts:17-21`).

## Schema

`@opencode-ai/schema` (`packages/schema/src/`) owns browser-safe wire and storage contracts. It depends only on `effect`. Root barrel exports (`packages/schema/src/index.ts:1-28`) include: `Agent`, `Command`, `Connection`, `Credential`, `Event`, `FileSystem`, `Integration`, `LLM`, `Location`, `Model`, `Permission`, `PermissionSaved`, `Project`, `ProjectCopy`, `Provider`, `Reference`, `Revert`, `Session`, `SessionInput`, `SessionMessage`, `Skill`, `Pty`, `PtyTicket`, `Question`, `Workspace`, `Prompt`, `PromptInput`.

Each contract is a single canonical exported value. `Session.Info` is a `Schema.Struct` at `packages/schema/src/session.ts:19-44` with a same-name interface (`packages/schema/src/session.ts:18`). IDs are branded strings with `create()` constructors (e.g., `Session.ID` at `packages/schema/src/session-id.ts`, `Location.Ref` at `packages/schema/src/location.ts:8-12`).

Core re-exports Schema values by reference identity. This is enforced by `packages/client/test/contract-identity.test.ts:25-31`:
- `AgentV2.ID === Agent.ID` (`packages/core/src/agent.ts` re-exports `packages/schema/src/agent.ts`)
- `SessionV2.Info === Session.Info` (`packages/core/src/session/schema.ts:8` re-exports `packages/schema/src/session.ts`)
- `SessionMessage.Message === CoreSessionMessage.Message` (`packages/core/src/session/message.ts:2` re-exports `packages/schema/src/session-message.ts`)

## Protocol HttpApi

`@opencode-ai/protocol` (`packages/protocol/src/`) defines the HTTP API using Effect's `HttpApi`/`HttpApiGroup`/`HttpApiEndpoint` from `effect/unstable/httpapi`. The central builder is `makeDefaultApi()` at `packages/protocol/src/api.ts:78-86`, which calls `makeApiFromGroup()` (`packages/protocol/src/api.ts:26-64`). This function composes 18 groups, attaches API-level middleware, and returns the complete `HttpApi`.

The 18 groups and their paths:

| Group ID | Module | Path Prefix | Status |
|---|---|---|---|
| `server.health` | `groups/health.ts` | `/api/health` | ACTIVE |
| `server.location` | `groups/location.ts` | `/api/location` | ACTIVE |
| `server.agent` | `groups/agent.ts` | `/api/agent` | ACTIVE |
| `server.session` | `groups/session.ts` | `/api/session` | ACTIVE |
| `server.message` | `groups/message.ts` | `/api/session/:sessionID/message` | ACTIVE |
| `server.model` | `groups/model.ts` | `/api/model` | ACTIVE |
| `server.provider` | `groups/provider.ts` | `/api/provider` | ACTIVE |
| `server.integration` | `groups/integration.ts` | `/api/integration` | ACTIVE |
| `server.credential` | `groups/credential.ts` | `/api/credential` | ACTIVE |
| `server.permission` | `groups/permission.ts` | `/api/permission` + `/api/session/:sessionID/permission` | ACTIVE |
| `server.fs` | `groups/fs.ts` | `/api/fs` | ACTIVE |
| `server.command` | `groups/command.ts` | `/api/command` | ACTIVE |
| `server.skill` | `groups/skill.ts` | `/api/skill` | ACTIVE |
| `server.event` | `groups/event.ts` | `/api/event` | ACTIVE |
| `server.pty` | `groups/pty.ts` | `/api/pty` | ACTIVE |
| `server.question` | `groups/question.ts` | `/api/question` + `/api/session/:sessionID/question` | ACTIVE |
| `server.reference` | `groups/reference.ts` | `/api/reference` | ACTIVE |
| `server.projectCopy` | `groups/project-copy.ts` | `/experimental/project/:projectID/copy` | EXPERIMENTAL |

Middleware is declared in Protocol but injected by Server. `makeApiFromGroup()` accepts two abstract `Context.Key` parameters (`packages/protocol/src/api.ts:28-35`): `locationMiddleware` for location-scoped endpoints and `sessionLocationMiddleware` for session-scoped endpoints. Two API-level middleware are applied to all endpoints (`packages/protocol/src/api.ts:63-64`): `Authorization` (`packages/protocol/src/middleware/authorization.ts:4`) and `SchemaErrorMiddleware` (`packages/protocol/src/middleware/schema-error.ts:4`).

Errors are `Schema.TaggedErrorClass` instances with `httpApiStatus` annotations (`packages/protocol/src/errors.ts:1-111`). There are 13 error types: `InvalidRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `ProviderNotFoundError` (404), `SessionNotFoundError` (404), `MessageNotFoundError` (404), `PermissionNotFoundError` (404), `QuestionNotFoundError` (404), `PtyNotFoundError` (404), `InvalidCursorError` (400), `ConflictError` (409), `UnknownError` (500), `ServiceUnavailableError` (503).

Pagination uses opaque base64url-encoded cursors for session lists (`packages/protocol/src/groups/session.ts:65-81`, `SessionsCursor`) and numeric `after` offsets for session history (`packages/protocol/src/groups/session.ts:89-92`, `SessionHistoryQuery`).

## Server

`@opencode-ai/server` (`packages/server/src/`) provides the authoritative concrete HttpApi. It constructs the API at `packages/server/src/api.ts:1-8` by calling `makeDefaultApi()` with concrete middleware keys from `packages/server/src/location.ts:11-13` (`LocationMiddleware`) and `packages/server/src/middleware/session-location.ts:15-20` (`SessionLocationMiddleware`).

Handlers are registered as Effect layers at `packages/server/src/handlers.ts:1-40`, one per group. Route assembly at `packages/server/src/routes.ts:51-62` wires `HttpApiBuilder.layer(Api)` with all handler and middleware layers via `Layer.provide()`.

Two entry points exist: `createRoutes(password?)` (`packages/server/src/routes.ts:39-45`) for standard server with optional Basic auth, and `createEmbeddedRoutes()` (`packages/server/src/routes.ts:47-49`) for in-process embedded use with no auth.

The `LocationMiddleware` resolves location from `location[directory]`/`location[workspace]` query params or `x-opencode-directory`/`x-opencode-workspace` headers, falling back to `process.cwd()` (`packages/server/src/location.ts:29-38`). The `SessionLocationMiddleware` looks up the session in the database to resolve its directory and workspace (`packages/server/src/middleware/session-location.ts:42-61`).

## Client Codegen Pipeline

`@opencode-ai/client` (`packages/client/src/`) contains two generated client variants and a contract definition file. The generation is triggered by `bun run generate` from `packages/client`, which runs `packages/client/script/build.ts`.

**Contract definition** (`packages/client/src/contract.ts:1-53`): Creates `ClientApi` by calling `makeDefaultApi()` with stub middleware keys (`LocationMiddleware` at line 5, `SessionLocationMiddleware` at line 9). Defines `groupNames` (18 entries, lines 19-38), `endpointNames` (10 entries, lines 40-51), and `omitEndpoints` (`fs.read`, `pty.connect`, `pty.connectToken`, line 53).

**Build script** (`packages/client/script/build.ts:1-30`):
1. `compile(ClientApi, { groupNames, endpointNames, omitEndpoints })` produces a `Contract` IR (`packages/httpapi-codegen/src/index.ts:76-213`)
2. `emitPromise(contract, { outputTypes })` generates the zero-Effect Promise client into `src/generated/`
3. `emitEffectImported(contract, { module: "../contract", api: "ClientApi" })` generates the Effect client into `src/generated-effect/`
4. Both are written concurrently with Prettier formatting

The `Contract` IR (`packages/httpapi-codegen/src/index.ts:29-31`) contains `Group[]`, each with `Endpoint[]` containing `Operation` metadata (group, name, input fields, input mode, success shape, error tags).

**Promise client** (`packages/client/src/generated/`): 4 files — `types.ts` (structural TS types, ~2800 lines), `client.ts` (fetch-based `make()`, ~1030 lines), `client-error.ts`, `index.ts`. SSE uses a custom async iterator that parses `data:` lines (`packages/client/src/generated/client.ts:192-247`).

**Effect client** (`packages/client/src/generated-effect/`): 3 files — `client.ts` (wraps `HttpApiClient.make(ClientApi)` with error adapters, ~706 lines), `client-error.ts`, `index.ts`. SSE uses Effect's native `StreamSse` decoding.

**Manifest** (`packages/client/src/generated/.httpapi-codegen.json`): JSON array of generated file paths. On regeneration, `write()` deletes stale files not in the new output (`packages/httpapi-codegen/src/index.ts:710-765`).

**CI gate**: `packages/client/package.json:13` — `check:generated` runs `bun run generate && git diff --exit-code -- src/generated src/generated-effect`, ensuring checked-in files match what codegen produces.

**Contract identity**: `packages/client/test/contract-identity.test.ts:40-44` asserts that `compile(Server.Api, ...)` and `compile(ClientApi, ...)` produce identical `emitPromise()` output. This is possible because both `Api` and `ClientApi` are constructed by `makeDefaultApi()` with the same groups from Protocol (`packages/protocol/src/api.ts:78-86`).

## SDK / SDK-Next

There are three SDK surfaces. Two are ACTIVE; one is EXPERIMENTAL.

**`@opencode-ai/sdk`** (ACTIVE): Published package (`packages/sdk/js/package.json:2`, version 1.18.30). Generated from OpenAPI JSON spec using `@hey-api/openapi-ts` (`packages/sdk/js/script/build.ts:47-72`). The OpenAPI spec is produced by running `bun dev generate` from `packages/opencode` (`packages/sdk/js/script/build.ts:14`). Exports v1 (`src/index.ts`) and v2 (`src/v2/index.ts`) client facades. This is the package external plugins depend on (`packages/plugin/package.json:25`).

**`@opencode-ai/client`** (ACTIVE): Private package (`packages/client/package.json:4`). Generated from the Effect HttpApi definition by `@opencode-ai/httpapi-codegen`. This is the contract source of truth — new API types flow from here. The app's `packages/app/src/context/server-session.ts:3` imports `SessionApi`, `OpenCodeEvent`, `SessionMessageInfo` from `@opencode-ai/client/promise`. The app's `packages/app/src/context/server-sdk.tsx:1` imports `OpenCodeEvent` from `@opencode-ai/client/promise`.

**`@opencode-ai/sdk-next`** (EXPERIMENTAL): Private package (`packages/sdk-next/package.json:4`). Composes `@opencode-ai/client` + `@opencode-ai/core` + `@opencode-ai/server` into an in-process embedded host (`packages/sdk-next/src/opencode.ts:10-43`). Creates an in-memory `fetch` adapter that routes requests directly to `HttpRouter.toWebHandler()` without network I/O (`packages/sdk-next/src/opencode.ts:32-34`). No production consumers found — the package is not imported by `packages/opencode`, `packages/app`, or `packages/server`. Only its own tests reference it (`packages/sdk-next/test/embedded.test.ts`, `packages/sdk-next/test/import-boundaries.test.ts`). The plugin package depends on `@opencode-ai/sdk`, not `sdk-next` (`packages/plugin/package.json:25`).

**App dual-client pattern**: The app imports types from both `@opencode-ai/sdk/v2/client` (99 imports) and `@opencode-ai/client/promise` (40 imports). A compatibility layer at `packages/app/src/utils/server-compat.ts:86-92` creates a lazy proxy (`createCompatibleApi`) that detects the server protocol version (`packages/app/src/utils/server-protocol.ts:24-35`) and routes to either the V1 SDK client or the V2 Promise client.

## Events

Event definitions live in `@opencode-ai/schema`. The `Event.define()` function (`packages/schema/src/event.ts:42-70`) creates tagged union members with optional durable metadata. `Event.inventory()` (`packages/schema/src/event.ts:72-74`) collects definitions into frozen arrays.

Two manifest collections exist at `packages/schema/src/event-manifest.ts`:

**`ServerDefinitions`** (line 57): Used by Protocol's `event.subscribe` endpoint. Contains V1 durable session events + V2 session events + feature events (filesystem, reference, permission, plugin, project directories, file watcher, PTY, question) + models.dev, integration, catalog, session todo.

**`Definitions`** (line 63): Superset used by legacy App/TUI. Adds V1 live session events, installation events, LSP, V1 permission, TUI, MCP, legacy, project, session status, V1 question, session compaction, VCS, workspace, worktree, server events.

V2 session events (`packages/schema/src/session-event.ts`) define 33 event types under the `session.next.*` namespace. Of these, 28 are durable (have `aggregate: "sessionID"` metadata) and 5 are live-only (stream fragments: `Text.Delta`, `Reasoning.Delta`, `Tool.Input.Delta`, `Compaction.Delta`). The `SessionEvent.Durable` union (`packages/schema/src/session-event.ts:514-516`) is used by `session.history` and `session.events` endpoints.

The `event.subscribe` endpoint (`packages/protocol/src/groups/event.ts:35-43`) returns `HttpApiSchema.StreamSse({ data: EventSchema })` where `EventSchema` is the union of `ServerDefinitions` with a fallback `server.connected` event. The `session.events` endpoint (`packages/protocol/src/groups/session.ts:327-343`) returns `HttpApiSchema.StreamSse({ data: SessionEvent.Durable })`.

In the generated Promise client, SSE is handled by a custom async iterator (`packages/client/src/generated/client.ts:192-247`) that reads the response body as a stream, splits on `\n\n` boundaries, extracts `data:` lines, and `JSON.parse()`s each event. In the generated Effect client, SSE uses Effect's native `StreamSse` decoding via `HttpApiClient`.

## Import Boundaries

Two test files enforce import boundaries:

**`packages/client/test/import-boundaries.test.ts`**: Bundles `@opencode-ai/client` (browser target) and asserts zero inputs from `effect`, `schema`, `protocol`, `core`, `server` (lines 17-21). Bundles `@opencode-ai/client/effect` and asserts it includes `effect`, `schema`, `protocol` but excludes `core` and `server` (lines 25-29).

**`packages/sdk-next/test/import-boundaries.test.ts`**: Bundles `@opencode-ai/sdk-next` (bun target) and asserts it includes `client`, `core`, and `server` (lines 13-15). This confirms sdk-next intentionally depends on all three.

**`packages/client/test/contract-identity.test.ts`**: Asserts reference identity between Core and Schema values (lines 25-31), group key identity between Server and Client APIs (line 33), and codegen output identity between Server and Client contracts (lines 40-44).

## Known Risks

**R1 — V1 session stack drives TUI/CLI** (CRITICAL): The 1631-line prompt loop at `packages/opencode/src/session/prompt.ts` operates entirely on V1 types (`SessionV1.WithParts`, `SessionV1.ToolPart`). The V2 session runner at `packages/core/src/session/runner/` is a parallel implementation. Both share the same SQLite database but use different event schemas and message representations.

**R2 — Dual HTTP clients in app** (HIGH): The app imports types from both `@opencode-ai/sdk/v2/client` (99 imports) and `@opencode-ai/client/promise` (40 imports). A compatibility proxy at `packages/app/src/utils/server-compat.ts:86-92` switches between V1 SDK and V2 Promise client at runtime based on protocol detection. Two different `Session` types coexist.

**R3 — Event type bridging** (HIGH): `packages/app/src/context/server-sdk.tsx:28-56` manually maps V2 event types to V1 names (e.g., `permission.v2.asked` → `permission.asked`). This mapping is fragile and must be updated when new events are added.

**R4 — V1/V2 component duplication** (MEDIUM): 10+ component pairs with `-v2` suffix coexist with V1 versions in `packages/app/src/components/`. No automated selection mechanism exists.

**R5 — V1 schema persistence** (MEDIUM): V1 session schemas at `packages/schema/src/v1/session.ts` (676 lines) must be maintained as long as any V1 durable event exists in the event log. The projector at `packages/core/src/session/projector.ts:35` handles both V1 and V2 events.

## Open Questions

1. **Is `@opencode-ai/sdk-next` intended for production use?** No production code imports it. Its tests exercise the full embedded host lifecycle (`packages/sdk-next/test/embedded.test.ts`), but it is not wired into the TUI, CLI, app, or plugin system.

2. **When will the V1 session stack be retired?** The V1 prompt loop at `packages/opencode/src/session/prompt.ts` is the only path for TUI/CLI session execution. The V2 runner at `packages/core/src/session/runner/` serves the HTTP API. No migration path is evident.

3. **Which SDK is authoritative for new features?** `@opencode-ai/client` (httpapi-codegen) generates from the Effect HttpApi definition and is the contract source of truth. `@opencode-ai/sdk` (OpenAPI/@hey-api) is generated from the server's OpenAPI output. New API types appear first in `@opencode-ai/client/promise`; the app consumes them there. The SDK is generated separately and may lag.

4. **What is the intended relationship between `@opencode-ai/sdk` and `@opencode-ai/sdk-next`?** The plugin package depends on `@opencode-ai/sdk` (`packages/plugin/package.json:25`), not `sdk-next`. The v2 plugin API (`packages/plugin/src/v2/`) defines its own `PluginContext` interface without importing from either SDK.

=====================================================================

# LLM, Providers, CodeMode & Plugins

## Overview

The LLM/provider subsystem spans four packages with distinct responsibilities: `@opencode-ai/llm` owns the provider-neutral protocol abstraction; `@opencode-ai/core` owns session orchestration, the model catalog, and the plugin runtime; `@opencode-ai/codemode` provides confined code execution; and `@opencode-ai/plugin` declares the plugin type contracts. Two runtime paths exist for provider calls — an AI-SDK default and an opt-in native `@opencode-ai/llm` path — both converging on the same `LLMEvent` stream consumed by the session runner.

## LLM Package (`@opencode-ai/llm`)

The package is Effect Schema-first. Schema classes in `packages/llm/src/schema/` are the canonical runtime data model; convenience constructors in `packages/llm/src/llm.ts` return those same class instances (`packages/llm/AGENTS.md:19-22`).

### Route / Protocol / Transport / Auth

A **Route** composes four orthogonal pieces (`packages/llm/src/route/client.ts:307-319`):

| Axis | Type | File |
|------|------|------|
| Protocol | `Protocol<Body, Frame, Event, State>` | `packages/llm/src/route/protocol.ts:36-43` |
| Endpoint | `Endpoint<Body>` (`baseURL`, `path`, `query`) | `packages/llm/src/route/endpoint.ts:22-26` |
| Auth | `Auth` (composable `apply`, `andThen`, `orElse`) | `packages/llm/src/route/auth.ts:33-38` |
| Framing | `Framing<Frame>` (SSE or AWS event-stream) | `packages/llm/src/route/framing.ts:19-22` |

`Route.make(input)` (`client.ts:321-339`) composes these into a `Route<Body, Prepared>` that carries immutable defaults, a `with()` patcher, and model/transport/prepare/streamPrepared methods.

**Protocols** (6 total, `packages/llm/src/protocols/index.ts:1-6`): `OpenAIChat`, `OpenAIResponses`, `AnthropicMessages`, `Gemini`, `BedrockConverse`, `OpenAICompatibleChat`. Each owns body construction, body schema, streaming event schema, and a parser state machine (`stream.initial`, `stream.step`, `stream.terminal`, `stream.onHalt`).

**Transport** (`packages/llm/src/route/transport/`): `HttpTransport.httpJson` (POST + framing, `transport/http.ts:118-150`) and `WebSocketTransport.json` (WebSocket + JSON message, `transport/websocket.ts:226-262`). The transport `prepare` step builds the `HttpClientRequest`; the `frames` step executes it and pipes the response through the framing layer.

**Auth** is composable: `Auth.bearer(source)` for Bearer tokens, `Auth.header(name, source)` for custom headers, `Auth.config(name)` for env-var resolution, `Auth.custom(apply)` for per-request signing (`auth.ts:85-155`). Provider facades use `AuthOptions.bearer(options, envVar)` (`auth-options.ts:47-55`) which honors an explicit `auth` override, then falls back to `apiKey` option → env var config.

**RequestExecutor** (`route/executor.ts:33`) wraps `HttpClient` with retry logic: max 2 retries, exponential backoff (500ms base, 10s cap), retryable on 429/503/504/529, only before observable output (`executor.ts:353-364`, `:91`).

## Provider Facades

11 provider facades live in `packages/llm/src/providers/` (`providers/index.ts:1-11`): `OpenAI`, `Anthropic`, `Azure`, `AmazonBedrock`, `Google`, `GitHubCopilot`, `Cloudflare` (AIGateway + WorkersAI), `OpenAICompatible`, `OpenRouter`, `XAI`.

Each facade follows the pattern: `configure(options)` returns `{ model, responses?, chat?, ... }` where `model(id)` applies provider-specific auth, endpoint, and options to a route, then calls `route.model({ id })`. DeepSeek, TogetherAI, Cerebras, Fireworks, and DeepInfra reuse `OpenAIChat.protocol` via `OpenAICompatible` (`providers/openai-compatible.ts`).

## Model Catalog & Options

### Source of truth: `models.dev` snapshot (ACTIVE)

`packages/core/src/models-dev.ts` (`:202-261`) fetches from `https://models.dev` (configurable via `OPENCODE_MODELS_URL`), caches to disk, and refreshes every 60 minutes (`:257`). The snapshot is a `Record<string, Provider>` keyed by provider ID, containing model IDs, capabilities, pricing, and API metadata. A bundled snapshot serves as fallback (`:220-221`).

The **Catalog** service (`packages/core/src/catalog.ts:62`) is a location-scoped `State.Transformable<Draft>` that holds `providers: Map<ProviderID, ProviderRecord>` and `models: Map<ModelID, ModelV2.MutableInfo>`. Location plugins populate and filter it during layer startup (`runner/model.ts:189`).

### Model resolution at runtime

`SessionRunnerModel.resolve(session)` (`runner/model.ts:188-213`) looks up the session's model in the catalog, resolves credentials via `Integration.Service`, and calls `fromCatalogModel(model, credential)` (`:131-170`) which maps the catalog entry's `api.package` to an `@opencode-ai/llm` route:

- `@ai-sdk/openai` → `OpenAIResponses.route` (`:142-147`)
- `@ai-sdk/anthropic` → `AnthropicMessages.route` (`:149-154`)
- `@ai-sdk/openai-compatible` → `OpenAICompatibleChat.route` (`:156-161`)

Anything else fails with `UnsupportedApiError` (`:163-169`).

### Options merge

Three layers: route defaults → model defaults → call-level. `GenerationOptions` (temperature, maxTokens, etc.) uses `findLast` precedence (`packages/llm/src/schema/options.ts:110-122`). `ProviderOptions` (provider-keyed `Record<string, Record<string, unknown>>`) deep-merges per provider key (`options.ts:39-51`). `HttpOptions` (raw body/headers/query overlays) merges shallow (`options.ts:66-72`).

## Session LLM Adapter

### Default path: AI SDK (ACTIVE)

`packages/opencode/src/session/llm.ts:226` — the native path is gated:

```ts
if (flags.experimentalNativeLlm) { ... }
```

`experimentalNativeLlm` is `bool("OPENCODE_EXPERIMENTAL_NATIVE_LLM")` (`packages/opencode/src/effects/runtime-flags.ts:54`), defaulting to `false`. The test at `packages/opencode/test/effect/runtime-flags.test.ts:88` confirms `OPENCODE_EXPERIMENTAL=true` does NOT enable native LLM — it requires its own explicit flag.

**Without the flag**, the default path calls `streamText()` from the AI SDK (`llm.ts:280-353`), then adapts `fullStream` events into `LLMEvent`s via `LLMAISDK.toLLMEvents()` (`llm/ai-sdk.ts:77-289`).

### Native path: `@opencode-ai/llm` (EXPERIMENTAL)

With `OPENCODE_EXPERIMENTAL_NATIVE_LLM=true`, `LLMNativeRuntime.stream()` (`llm/native-runtime.ts:74-146`) checks provider compatibility (OpenAI, Anthropic, or opencode-* with matching npm packages, `:55-59`), builds an `LLMRequest` via `LLMNative.request()` (`llm/native-request.ts:181-194`), and calls `llmClient.stream(request)` (`native-runtime.ts:109`). Unsupported providers fall back to AI SDK (`llm.ts:260-268`).

Both paths emit the same `LLMEvent` stream; the session processor is runtime-agnostic (`llm.ts:368-378`).

### Request preparation

`LLMRequestPrep.prepare()` (`llm/request.ts:56-206`) assembles system prompt, merges provider options, triggers `chat.params` and `chat.headers` plugin hooks, resolves tools via permission filtering, and forces `strict: false` for OpenAI/Azure/Bedrock (`:152-158`).

## Tool Runtime

### `@opencode-ai/llm` tool system

`Tool.make(config)` (`packages/llm/src/tool.ts:133-206`) supports typed (Effect Schema) and dynamic (raw JSON Schema) modes. `ToolRuntime.dispatch(tools, call)` (`tool-runtime.ts:23-35`) decodes input via Schema, executes the handler, encodes output, and returns `DispatchResult` with `LLMEvent`s. Failures become `tool-error` + error `tool-result` events (`:31-33`, `:63-76`).

### Session-level tool settlement

The V2 runner (`packages/core/src/session/runner/llm.ts:257-278`) wraps each tool settlement in `Effect.uninterruptibleMask` — the tool execution itself is interruptible, but the result publication is uninterruptible. Tool calls are forked into a `FiberSet` (`:184`, `:278`) and awaited after the provider stream completes (`:303`).

## CodeMode

`@opencode-ai/codemode` (`packages/codemode/codemode.md`) provides confined JavaScript execution over schema-described tools. `CodeMode.execute(options)` (`packages/codemode/src/codemode.ts:137-143`) transpiles TypeScript, parses with Acorn (`interpreter/runtime.ts:115-149`), and runs a tree-walking interpreter.

Key constraints: max 8 concurrent tool calls (`stdlib/promise.ts:6`), max value depth 32 (`tool-runtime.ts:122`), no modules/imports/eval/ambient globals (`codemode.md:120-124`). Tool calls start eagerly on supervised fibers gated by a semaphore (`runtime.ts:611`, `:628`, `:723`). Data crosses the sandbox boundary via `copyIn`/`copyOut` which validates depth, circularity, and plain-object structure (`tool-runtime.ts:171-314`).

CodeMode is integrated into V2 via `packages/core/src/tool/registry.ts` — deferred tools become CodeMode namespaces when enabled (`codemode.md:93-108`). It is gated behind `OPENCODE_EXPERIMENTAL_CODE_MODE` (`runtime-flags.ts:48`).

## Plugin System

### V1 plugins (ACTIVE, legacy)

`packages/plugin/src/index.ts:74` defines `Plugin = (input: PluginInput, options?) => Promise<Hooks>`. The `Hooks` interface (`:222-335`) has ~20 hook points (`chat.params`, `chat.headers`, `tool.execute.before/after`, `permission.ask`, etc.). The core `Plugin.Service` in `packages/opencode/src/plugin/index.ts:60` loads internal plugins (Copilot, Codex, Modal, etc.) and external npm plugins, stores `Hooks[]`, and exposes `trigger(name, input, output)` which iterates hooks sequentially (`:284-297`).

### V2 plugins (ACTIVE, integrated)

**V2 plugins are fully integrated**, not dormant. Evidence:

1. `PluginV2.Service` (`packages/core/src/plugin.ts:29`) defines `add(id, effect)`, `remove(id)`, `wait(id)`.
2. It is a **location-scoped** node (`plugin.ts:154-167`) in the `locationServices` group (`location-services.ts:52`).
3. `PluginHost.make(service)` (`plugin.ts:140`) creates the `PluginContext` that v2 plugins receive, wiring `AgentHooks`, `CatalogHooks`, `CommandHooks`, `IntegrationHooks`, `ReferenceHooks`, `SkillHooks`, `AISDKHooks` (`plugin/host.ts:3`, `:194-195`).
4. `PluginInternal` (`plugin/internal.ts:67`, `:105`) loads v2 effect plugins via `plugin.add()`.
5. Provider plugins use v2 types: `packages/core/src/plugin/provider/openai.ts:4` imports `define` from `@opencode-ai/plugin/v2/effect/plugin`.
6. External plugin loading (`config/plugin/external.ts:3-4`) imports both `@opencode-ai/plugin/v2/effect` and `@opencode-ai/plugin/v2/promise`.

V2 effect plugins have `effect: (context: PluginContext) => Effect<void, never, Scope>` (`packages/plugin/src/v2/effect/plugin.ts:4-7`). Each plugin runs in a child scope (`plugin.ts:58-63`); closing the scope releases registrations. Promise plugins have `setup: (context) => Promise<void>` (`packages/plugin/src/v2/promise/plugin.ts:3-6`).

V1 and V2 coexist: V1 hooks are used by the opencode session layer (`packages/opencode/src/session/llm.ts:79`, `request.ts:69-73`); V2 plugins are used by core location services.

## Known Risks

| Severity | Risk | Location |
|----------|------|----------|
| **Critical** | Embedded `sdk-next` request scope lifetime: streaming response bodies reference scoped resources; premature scope disposal silently interrupts streams | `sdk-next/src/opencode.ts:10-43`, `CONTEXT.md:216` |
| **High** | All SQLite access serialized through `Semaphore.make(1)` — WAL concurrent-read benefit negated; long transactions (event commit + projectors) block all other DB access | `database/sqlite.node.ts:115`, `database.ts:27` |
| **High** | No concurrency guard on `SessionRunner.run()` for the same session — concurrent `resume`+`wake` could produce duplicate provider turns | `session/runner/llm.ts:390-413`, `session/execution.ts:26-33` (noop) |
| **High** | Owner claims in event store are bare UPDATEs outside transactions — last-writer-wins race | `event.ts:525-532` |
| **Medium** | Session move does not interrupt active execution; runner detects location mismatch and interrupts next turn, but current turn continues with stale location context | `control-plane/move-session.ts:77-138`, `runner/llm.ts:180-181` |
| **Medium** | `FiberSet.clear()` not called on all interruption paths in runner — `TurnTransitionError` retries create new FiberSets while old fibers may still be running | `runner/llm.ts:302`, `:378-387` |
| **Low** | Process-global `memoMap` (`makeMemoMapUnsafe`) never finalized; leaked layers persist for process lifetime | `effect/memo-map.ts:3` |

## Open Questions

1. **Native LLM graduation**: When does `OPENCODE_EXPERIMENTAL_NATIVE_LLM` become default? The gate is explicit (`runtime-flags.ts:54`), the native path supports only 3 provider packages (`native-runtime.ts:55-59`), and the AI SDK path remains the production default.

2. **V1 plugin deprecation**: V1 hooks (`packages/plugin/src/index.ts:222-335`) and V2 plugin types coexist. The V1 `Plugin` type is used by the opencode session layer; V2 is used by core. No migration path or deprecation timeline is visible.

3. **Catalog completeness**: The `SessionRunnerModel.fromCatalogModel` (`runner/model.ts:131-170`) only supports 3 AI SDK packages. Providers using other packages (Bedrock, Google, etc.) are only available through the AI SDK session path, not the native path.

4. **Embedded scope safety**: `CONTEXT.md:216` acknowledges the streaming scope lifetime boundary but no enforcement exists in `sdk-next/src/opencode.ts`. Session and instance event streams must hold the request scope alive until body consumption completes.

5. **SQLite throughput**: The single-connection semaphore (`sqlite.node.ts:115`) serializes all I/O. With multiple active sessions performing tool settlements (each publishing 2-4 events), the database becomes the bottleneck before the Effect runtime does.

=====================================================================

# User Interfaces

## Overview

OpenCode ships four UI surfaces built on a shared SolidJS component layer:

| Surface | Package | Framework | Status |
|---------|---------|-----------|--------|
| Terminal UI | `@opencode-ai/tui` | OpenTUI (`@opentui/core` + `@opentui/solid`) | **ACTIVE** |
| Web App | `@opencode-ai/app` | SolidJS + Vite + Tailwind CSS | **ACTIVE** |
| Desktop | `@opencode-ai/desktop` | Electron 42 + `@opencode-ai/app` renderer | **ACTIVE** |
| Documentation | `@opencode-ai/web` | Astro + Starlight | **ACTIVE** |
| Cloud Console | `@opencode-ai/console-app` | SolidStart + Cloudflare | **ACTIVE** |
| Storybook | `@opencode-ai/storybook` | Storybook 10 + `storybook-solidjs-vite` | **ACTIVE** |

Shared component libraries `@opencode-ai/ui` (generic primitives) and `@opencode-ai/session-ui` (chat/session components) are consumed by TUI, App, Desktop, and Storybook.

## Package Map

```
@opencode-ai/ui              ← leaf; no internal deps; SolidJS + Kobalte
@opencode-ai/session-ui      ← depends on ui, sdk, core (utilities only)
@opencode-ai/app             ← depends on ui, session-ui, sdk, client (vendored), core (utilities)
@opencode-ai/tui             ← depends on ui, sdk, core, plugin, opentui/*
@opencode-ai/desktop         ← depends on app, ui (Electron wrapper)
@opencode-ai/web             ← standalone docs site
@opencode-ai/storybook       ← depends on ui, session-ui
@opencode-ai/console-app     ← depends on ui, console-core (separate product)
```

No UI package imports `@opencode-ai/server`. `@opencode-ai/core` usage in `session-ui` and `app` is limited to pure utilities (`core/util/path`, `core/util/encode`, `core/util/binary`).

## TUI

### Framework

The TUI renders into a terminal via `@opentui/core` (a custom terminal rendering engine) with SolidJS bindings from `@opentui/solid`. The keybinding system is `@opentui/keymap`. Entry point: `packages/tui/src/index.tsx:1` re-exports `run` from `./app`.

### Bootstrap

`run` is an `Effect.fn` generator (`packages/tui/src/app.tsx:186`). It creates a `CliRenderer` at 60fps (`app.tsx:194`), registers the keymap (`app.tsx:217`), and calls `render()` from `@opentui/solid` (`app.tsx:245`) to mount a deeply nested provider tree (~25 layers): `ExitProvider → EpilogueProvider → ErrorBoundary → ... → SDKProvider → ... → App` (`app.tsx:246–351`).

### Routing

Manual `<Switch>/<Match>` on `route.data.type` (`app.tsx:1112–1121`):
- `"home"` → `Home` (`packages/tui/src/routes/home.tsx:22`)
- `"session"` → `Session` (`packages/tui/src/routes/session/index.tsx:177`)
- `"plugin"` → dynamically resolved from `pluginRuntime.routes` (`app.tsx:1079–1084`)

### State Management

`SyncProvider` (`packages/tui/src/context/sync.tsx:60`) owns a single `createStore` (`sync.tsx:70`) containing all application state: `provider`, `agent`, `session`, `message`, `part`, `session_status`, `permission`, `question`, `todo`, `mcp`, `vcs`, etc. Bootstrap (`sync.tsx:451`) parallel-fetches providers, agents, config, sessions, commands, LSP, MCP, and VCS status via `sdk.client.*` methods. Events from the SDK's SSE stream update the store reactively (`sync.tsx:176–446`).

### Client

TUI uses **exclusively** `@opencode-ai/sdk/v2` — the legacy generated client (`packages/tui/src/context/sdk.tsx:1`). `createOpencodeClient` is called at `sdk.tsx:24`. There is no usage of `@opencode-ai/client` (the current API client) anywhere in the TUI package.

### Prompt Flow

`Prompt` component (`packages/tui/src/component/prompt/index.tsx:143`) renders a `<textarea>` from `@opentui/core` (`prompt/index.tsx:1369`). On submit (`prompt/index.tsx:931`):

1. Validate: not disabled, not empty, agent/model selected (`prompt/index.tsx:957–971`)
2. **New session**: `sdk.client.session.create(...)` (`prompt/index.tsx:1000`)
3. **Shell mode**: `sdk.client.session.shell(...)` (`prompt/index.tsx:1061`)
4. **Slash command**: `sdk.client.session.command(...)` (`prompt/index.tsx:1083`)
5. **Normal prompt**: `sdk.client.session.prompt(...)` (`prompt/index.tsx:1094`)
6. Navigate to session route (`prompt/index.tsx:1138`)

### Command Palette and Slash Commands

`registerOpencodeKeymap` (`packages/tui/src/keymap.tsx:214`) sets up mode stacks, leader keys, and key aliases. Commands are registered via `useBindings()` hooks in `app.tsx` and `routes/session/index.tsx`. `useCommandSlashes()` (`keymap.tsx:260`) derives slash commands from palette commands with `slashName`. The session page registers 30+ commands (`routes/session/index.tsx:465–1084`) including `/share`, `/rename`, `/fork`, `/compact`, `/undo`, `/redo`, `/export`.

### Plugin System

**Runtime**: `createPluginRuntime()` (`packages/tui/src/plugin/runtime.tsx:12`) returns `{ Slot, routes, commands, status, update, clear, setupSlots }`.

**Slots**: `createSlots()` (`packages/tui/src/plugin/slots.tsx:25`) uses `@opentui/solid`'s `createSolidSlotRegistry`. Named slots: `app`, `app_bottom`, `home_logo`, `home_prompt`, `home_prompt_right`, `home_footer`, `session_prompt`, `session_prompt_right`.

**Routes**: `createPluginRoutes()` (`packages/tui/src/plugin/api.ts:11`) maintains a `Map<string, RouteEntry[]>`. When `route.data.type === "plugin"` (`app.tsx:1079`), the render function is resolved from `pluginRuntime.routes.get(route.data.id)`.

**Host**: `TuiPluginHost` interface (`runtime.tsx:61–69`) is implemented externally; `start()` receives `{ api, config, runtime, dispose }`. The API surface is constructed by `createTuiApi` (`api.ts:42`) from adapters built in `createTuiApiAdapters` (`packages/tui/src/plugin/adapters.tsx`).

## Web App

### Framework and Build

SolidJS with `@solidjs/router`, Tailwind CSS, Vite. Entry: `packages/app/src/entry.tsx:152` renders `PlatformProvider → AppBaseProviders → AppInterface` into `#root`. E2E tests use Playwright (`packages/app/e2e/`).

### Provider Architecture

Five-tier provider hierarchy:

1. **`ServerProvider`** (`packages/app/src/context/server.tsx:255`): Manages `ServerConnection.Any` list (http/sidecar/ssh), persisted to localStorage (`server.tsx:263`), holds active `ServerConnection.Key`.

2. **`GlobalProvider`** (`packages/app/src/context/global.tsx:13`): Creates per-server contexts via `ensureServerCtx(conn)` (`global.tsx:45`). Each `ServerCtx` (`global.tsx:96`) owns a dedicated `QueryClient`, `ServerSDK`, and `ServerSync`.

3. **`ServerSDKProvider`** (`packages/app/src/context/server-sdk.tsx:386`): Returns accessor to `ServerSDK` for the active server.

4. **`ServerSyncProvider`** (`packages/app/src/context/server-sync.tsx:740`): Returns accessor to `ServerSync` for the active server.

5. **`SDKProvider`** (`packages/app/src/context/sdk.tsx:7`): Directory-scoped SDK resolved from `useServerSDK().ensureDirSdkContext(directory)`.

### Dual-Client Architecture

The app uses **two** HTTP client libraries simultaneously (`packages/app/src/utils/server.ts`):

- **Legacy**: `createOpencodeClient` from `@opencode-ai/sdk/v2/client` (`server.ts:1,34`). Created via `createSdkForServer()` (`server.ts:21`).
- **Current**: `OpenCode.make()` from `@opencode-ai/client/promise` (`server.ts:2,48`). Created via `createApiForServer()` (`server.ts:44`). Returns `OpenCodeClient` aliased as `ServerApi` (`server.ts:62`).

Both are instantiated in `createServerSdkContextBase` (`server-sdk.tsx:336–341`). A compatibility adapter (`createCompatibleApi` at `server-sdk.tsx:349`) routes calls to the correct client based on `detectServerProtocol()` (`server-sdk.tsx:208`).

**Important**: `@opencode-ai/client` is **not** from the workspace — it is a **vendored tarball** at `packages/app/vendor/opencode-ai-client-1.17.13-v2.tgz` (`packages/app/package.json:57`). The same tarball is referenced by `session-ui` (`packages/session-ui/package.json:41`). This pins the client to version 1.17.13 regardless of workspace state.

### Event System

`createServerSdkContextBase` (`server-sdk.tsx:187`) opens an SSE stream. Protocol detection (`server-sdk.tsx:275–279`):
- **v1**: `eventSdk.global.event({ signal })` — legacy SDK `.stream` iterator
- **v2**: `eventApi.event.subscribe({ signal })` — current API client

Events are queued with a 16ms flush window (`server-sdk.tsx:218`). Delta events (`session.text.delta`, `session.reasoning.delta`, `session.tool.input.delta`, `session.compaction.delta`) are coalesced within frames (`server-sdk.tsx:79–139`). Flushed events emit via `emitter.emit(directory, payload)` (`server-sdk.tsx:241`), keyed by directory.

### Event Reducer

`ServerSyncProvider` subscribes at `server-sync.tsx:531`:
```
serverSDK.event.listen((e) => { ... })
```

The listener delegates to:
- `applyGlobalEvent()` (`packages/app/src/context/global-sync/event-reducer.ts:37`) for global events (project updates, server connected)
- `applyDirectoryEvent()` (`event-reducer.ts:109`) for directory-scoped events

`applyDirectoryEvent` is a switch on `event.type` (`event-reducer.ts:126–478`) handling: `session.created` (binary-search insert), `session.updated`, `session.deleted`, `message.updated`, `message.part.delta` (appends to `store.part_text_accum_delta` and mutates `store.part`), `permission.asked`/`replied`, `vcs.branch.updated`, etc.

### Prompt Submission Flow

`createPromptSubmit` (`packages/app/src/components/prompt-input/submit.ts:234`).

New session path (`submit.ts:362–435`):
1. `sdk().api.session.create(...)` via current API client (`submit.ts:403`)
2. Seed session into store (`submit.ts:418`)
3. Navigate: `navigate(\`/${base64Encode(sessionDirectory)}/session/${session.id}\`)` (`submit.ts:431`)

Followup path via `sendFollowupDraft` (`submit.ts:58`):
1. Optimistic busy status (`submit.ts:62`)
2. Optimistic message insertion (`submit.ts:140`)
3. `input.api.prompt(...)` via current API (`submit.ts:168`)
4. On error: rollback optimistic updates (`submit.ts:201–204`)

Streaming response: SSE events → `applyDirectoryEvent` → `message.part.delta` appends text to `store.part[messageID]`. Session page reads `sync.data.part[message.id]` reactively.

### V1 API Migration Status

`packages/app/V1_API_MIGRATION.md` documents ~30 unchecked migration items remaining. Key gaps: file listing/reads, config reads/updates, credential management, worktree CRUD, legacy type adapters. The app is hybrid — some paths use current API, others fall back to legacy.

## Desktop

### Electron Architecture

**Not Tauri**. Electron 42 (`packages/desktop/package.json:51`) with `electron-vite` (`package.json:53`) and `electron-builder` (`package.json:52`). Three-process model:

**Main** (`packages/desktop/src/main/index.ts:115`): `Effect.gen` bootstrapper. Manages app lifecycle, sidecar server, IPC handlers (30+), auto-updater, deep links (`opencode://` protocol), WSL servers, window management.

**Preload** (`packages/desktop/src/preload/index.ts:13`): Exposes `window.api` via `contextBridge.exposeInMainWorld("api", api)` (`preload/index.ts:138`). 70+ IPC methods: sidecar control, updater, WSL, file pickers, store persistence, drafts, window management, clipboard, zoom, menus, background color.

**Renderer** (`packages/desktop/src/renderer/index.tsx:1`): Imports `AppBaseProviders`, `AppInterface`, `PlatformProvider` from `@opencode-ai/app` (`renderer/index.tsx:3–17`). Creates a `Platform` object (`renderer/index.tsx:113`) bridging Electron APIs. Uses `MemoryRouter` (`renderer/index.tsx:105–111`) with persisted URL state.

### Sidecar Modes

Gated by `OPENCODE_SIDECAR_V2` env (`packages/desktop/src/main/index.ts:64`):

**v1** (default, `index.ts:350–406`): Finds free port, generates UUID password, spawns opencode CLI as child process via `spawnLocalServer()`, health-checks with 30s timeout.

**v2** (opt-in, `index.ts:333–348`): Calls `startBackgroundCli()` (`packages/desktop/src/main/background-cli.ts:19`). Resolves bundled CLI executable, checks for existing background service (`service status`), starts service (`service start`), retrieves password (`service get password`). Returns `{ url, username: "opencode", password }`.

Both modes signal readiness via `Deferred.succeed(serverReady, ...)` (`index.ts:336,387`).

### Build Configuration

`packages/desktop/electron-builder.config.ts`: Targets macOS (dmg+zip), Windows (nsis), Linux (AppImage+deb+rpm). Three channels: dev/beta/prod with distinct app IDs (`ai.opencode.desktop.*`). `electron.vite.config.ts` has three build targets: main (`src/main/index.ts` + `src/main/sidecar.ts`), preload (`src/preload/index.ts`), renderer (reuses `@opencode-ai/app/vite` plugin).

## Shared Components

### `@opencode-ai/ui`

Generic UI primitives library. 60+ components in `packages/ui/src/components/`: button, dialog, tabs, toast, avatar, icon, spinner, diff-changes, scroll-view, select, tooltip, etc. Built on Kobalte headless primitives. No internal dependencies — peer-depends only on `solid-js` and `@solidjs/meta`.

Exports via wildcard: `"./*": "./src/components/*.tsx"` (`packages/ui/package.json:37`).

### `@opencode-ai/session-ui`

Session/chat-specific components. 40+ components in `packages/session-ui/src/components/`: markdown rendering, message parts, session turns, session review, line comments, tool cards, prompt input, file components. Depends on `@opencode-ai/ui`, `@opencode-ai/sdk`, and `@opencode-ai/core` (utilities only: `core/util/path`, `core/util/encode`, `core/util/binary`).

### V1 vs V2 Component Trees

Both libraries maintain parallel component trees:
- **V1**: `src/components/*.tsx` — original design
- **V2**: `src/v2/components/*-v2.tsx` — new design, each with `.css` and `.stories.tsx`

V2 exports: `"./v2/*": "./src/v2/components/*.tsx"` (`packages/ui/package.json:55`, `packages/session-ui/package.json:21`). UI has 86 V2 files; session-ui has 22.

### Markdown Pipeline

Three-stage pipeline in `session-ui`:

1. **Worker** (`packages/session-ui/src/components/markdown-worker.ts`): Lazily creates a `Worker` from `markdown.worker.ts` (`markdown-worker.ts:120`). Three transport types: `highlight` (code syntax via shiki), `project` (markdown projection), `parse` (simple HTML). `highlightStreamingCode()` (`markdown-worker.ts:86`) sends incremental highlight requests; supersedes stale requests for the same key.

2. **Cache** (`packages/session-ui/src/components/markdown-cache.tsx`): LRU cache of 200 entries (`markdown-cache.tsx:11`). `preloadMarkdown()` (`markdown-cache.tsx:55`) computes checksum, parses via worker, sanitizes via DOMPurify with allowed tags (`svg`, `path`) and `target="_blank"` + `rel="noopener noreferrer"` enforcement (`markdown-cache.tsx:22–32`).

3. **Render**: `markdown.tsx` renders sanitized HTML via `morphdom` for efficient incremental DOM updates.

## Web / Console / Storybook

### `@opencode-ai/web` (Documentation)

Astro 5.7 + Starlight + Cloudflare adapter (`packages/web/astro.config.mjs:13–18`). 17 locales configured (`astro.config.mjs:38–127`). Server-rendered on Cloudflare Workers. Custom Astro components for Hero, Head, Header, Footer, LanguageSelect, SiteTitle (`astro.config.mjs:297–304`). Depends on `opencode` workspace package for schema generation script.

### `@opencode-ai/console-app` (Cloud Console)

SolidStart app (`packages/console/app/package.json`) with Cloudflare deployment. Uses `@opencode-ai/console-core`, `@opencode-ai/console-mail`, `@opencode-ai/console-resource`, `@opencode-ai/ui`. Manages org settings, billing (Stripe), usage tracking. Separate product from the main opencode tooling.

### `@opencode-ai/storybook`

Storybook 10.2 (`packages/storybook/package.json:27`) with `storybook-solidjs-vite` adapter. Depends on `@opencode-ai/session-ui` and `@opencode-ai/ui` for component development. Run via `bun --cwd packages/storybook storybook`.

## Known Risks

| Risk | Severity | Evidence |
|------|----------|----------|
| TUI uses only legacy `@opencode-ai/sdk/v2` client; no migration path to current API | HIGH | `packages/tui/src/context/sdk.tsx:1` |
| `@opencode-ai/client` is vendored tgz (v1.17.13), not workspace; drifts from `packages/client` source | HIGH | `packages/app/package.json:57` |
| V1 API migration ~30 items unchecked; app is hybrid legacy/current | MEDIUM | `packages/app/V1_API_MIGRATION.md` |
| Desktop v2 sidecar gated by env var, not default; v1 is production path | MEDIUM | `packages/desktop/src/main/index.ts:64` |
| `session-ui` depends on `@opencode-ai/core` utilities, violating stated dependency rules | LOW | `packages/session-ui/src/components/session-turn.tsx:12–13` |
| SDK v2 generated code has no CI freshness check | HIGH | No `check:generated` in `packages/sdk/js/package.json` |
| Core DB migration `--check` exists but not wired in CI | MEDIUM | `packages/core/script/migration.ts:64` not in any workflow |

## Open Questions

1. **TUI migration to current API**: Will `@opencode-ai/tui` adopt `@opencode-ai/client` (current API) or continue on `@opencode-ai/sdk/v2` (legacy)?
2. **Vendored client update cadence**: What triggers updating `packages/app/vendor/opencode-ai-client-*.tgz`? No automation detected.
3. **V2 sidecar promotion**: When does `OPENCODE_SIDECAR_V2=1` become the default?
4. **V1/V2 component tree convergence**: Is the V2 tree (`src/v2/`) intended to replace V1, or will both coexist indefinitely?
5. **Console app relationship**: Does `console-app` share auth/session state with the main web app, or are they fully independent products?

=====================================================================

# Persistence, Infrastructure & Tooling

## Overview

OpenCode is a Bun + TypeScript monorepo with 32 packages managed via Bun workspaces and Turborepo. The persistence layer is local SQLite accessed through a custom Drizzle-to-Effect adapter. The cloud surface spans Cloudflare Workers/Durable Objects/R2, PlanetScale MySQL, AWS S3 Tables/Firehose/Athena/ECS, Honeycomb, and Stripe. CI runs on Blacksmith runners with GitHub Actions; releases produce signed CLI binaries, Electron desktop apps, npm packages, Docker images, and AUR packages.

## Database & Migrations

### SQLite Runtime

The local database is SQLite, accessed through Drizzle ORM wrapped in Effect 4 services. Two conditional implementations exist via Node.js subpath imports (`#sqlite`):

- **Bun** (`packages/core/src/database/sqlite.bun.ts:1-183`): Uses `bun:sqlite` `Database`. Creates an Effect `SqlClient` with a `Semaphore.make(1)` single-connection guard, WAL mode, and a `drizzle({ client })` layer.
- **Node** (`packages/core/src/database/sqlite.node.ts:1-178`): Uses `node:sqlite` `DatabaseSync`. Same Effect layer pattern.

The subpath import is declared at `packages/core/package.json:26-31`:
```json
"#sqlite": {
  "bun": "./src/database/sqlite.bun.ts",
  "node": "./src/database/sqlite.node.ts",
  "default": "./src/database/sqlite.bun.ts"
}
```

### Bootstrap Sequence

`Database.node` (`packages/core/src/database/database.ts:57`) triggers:

1. `layerFromPath(filename)` (`database.ts:39-41`) composes the SQLite layer with the Drizzle layer.
2. `EffectDrizzleSqlite.makeWithDefaults()` (`effect-drizzle-sqlite/src/effect-sqlite/driver.ts:75-77`) creates the Drizzle database backed by the generic Effect `SqlClient`.
3. Pragmas set sequentially (`database.ts:27-32`): `WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `cache_size=-64000`, `foreign_keys=ON`, `wal_checkpoint(PASSIVE)`.
4. `DatabaseMigration.apply(db)` runs (`database.ts:33`).

### DB Path Resolution

`database.ts:43-55`: Defaults to `<data_dir>/opencode.db`. Supports `OPENCODE_DB` env override (`:memory:` for tests, absolute path, or relative to data dir). Channel-specific databases for non-standard installation channels.

### Custom Migration System

The migration system is **custom TypeScript**, not Drizzle's runtime migration runner. Drizzle Kit is used only for *generation* (schema diffing), not for runtime application.

**`Migration` type** (`migration.ts:13-16`):
```typescript
export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}
```

**`apply(db)` dispatch** (`migration.ts:18-41`):
- Existing DB with `session` table → `applyOnly(db, migrations)` (incremental)
- Empty DB → full schema bootstrap via `schema.up(tx)` + journal creation
- Non-empty DB without `session` table → `Effect.die`

**`applyOnly(db, input)`** (`migration.ts:43-107`):
1. Creates `migration` journal table if absent (line 45-46)
2. Reads completed IDs into a `Set` (line 48-49)
3. Legacy `__drizzle_migrations` import (lines 51-93): handles both named and unnamed legacy journal formats
4. Iterates migrations, skips completed, runs each in a transaction (lines 96-106)

A `Semaphore.makeUnsafe(1)` at module scope (line 11) serializes concurrent `apply()` calls.

### Generated Artifacts

| Artifact | File | Generator |
|----------|------|-----------|
| Drizzle snapshot | `packages/core/schema.json` | `drizzle-kit generate` |
| Migration TS files | `packages/core/src/database/migration/*.ts` (38 files) | `script/migration.ts` |
| Migration registry | `packages/core/src/database/migration.gen.ts` | `script/migration.ts` |
| Full schema | `packages/core/src/database/schema.gen.ts` (274 lines) | `script/migration.ts` |

**Generation tool** (`packages/core/script/migration.ts:30-61`):
1. Copies `schema.json` snapshot to temp dir
2. Runs `drizzle-kit generate` for incremental diff
3. Renders TypeScript migration from SQL (`renderMigration()`, lines 127-139)
4. Regenerates `schema.gen.ts` and `migration.gen.ts`
5. Formats with Prettier

**`--check` mode** (`script/migration.ts:64-92`): Verifies no ungenerated migrations exist, schema.gen.ts is fresh, and migration.gen.ts matches the filesystem.

### CI Freshness Gates

- **`--check`**: Not run directly in any CI workflow. Instead, it runs **indirectly** through `packages/core/test/database-migration.test.ts:116-123`, gated to Linux only (`if (process.platform === "linux")`). This test calls `bun script/migration.ts --check` as a subprocess.
- **Client `check:generated`**: Runs in CI at `.github/workflows/test.yml:72-75` (Linux only). Regenerates client code and checks `git diff --exit-code`.
- **`generate.yml`**: Auto-commits generated code on push to `dev`, providing a freshness gate for SDK and OpenAPI spec.

**Gap**: `schema.gen.ts` and `migration.gen.ts` freshness is only checked on Linux in CI. Windows CI runs do not verify these artifacts.

### Schema Inventory

20 tables total (19 declared in Drizzle, 1 runtime-only):

| Table | File:Line | Domain |
|-------|-----------|--------|
| `project` | `project/sql.ts:6` | Project management |
| `project_directory` | `project/sql.ts:20` | Project directories |
| `workspace` | `control-plane/workspace.sql.ts:6` | Workspaces |
| `session` | `session/sql.ts:22` | Sessions (27 columns) |
| `message` | `session/sql.ts:68` | V1 messages (legacy) |
| `part` | `session/sql.ts:82` | V1 message parts (legacy) |
| `todo` | `session/sql.ts:100` | Session todos |
| `session_message` | `session/sql.ts:119` | V2 projected messages |
| `session_input` | `session/sql.ts:140` | V2 durable prompt inputs |
| `session_context_epoch` | `session/sql.ts:168` | Context snapshots |
| `session_share` | `share/sql.ts:5` | Session sharing |
| `event_sequence` | `event/sql.ts:4` | Aggregate sequences |
| `event` | `event/sql.ts:10` | Durable events |
| `permission` | `permission/sql.ts:7` | Saved permissions |
| `account` | `account/sql.ts:6` | User accounts |
| `account_state` | `account/sql.ts:16` | Active account selection |
| `control_account` | `account/sql.ts:25` | Legacy accounts |
| `credential` | `credential/sql.ts:5` | Integration credentials |
| `data_migration` | `data-migration.sql.ts:3` | Data-level migrations |
| `migration` | `migration.ts:29-31` (runtime) | Schema migration journal |

Custom column types for paths at `packages/core/src/database/path.ts:27-91`: `absoluteColumn`, `directoryColumn`, `pathColumn`, `absoluteArrayColumn` with Windows `\` → `/` normalization.

## Event Store

Two tables power the durable event system (`packages/core/src/event/sql.ts`):

- **`event_sequence`** (line 4-8): `aggregate_id TEXT PK`, `seq INTEGER`, `owner_id TEXT` (nullable, for replay ownership)
- **`event`** (line 10-25): `id TEXT PK`, `aggregate_id TEXT FK→event_sequence`, `seq INTEGER`, `type TEXT` (versioned), `data TEXT` (JSON). Unique index on `(aggregate_id, seq)`.

`EventV2.Service` (`packages/core/src/event.ts:126-148`) provides: `publish`, `subscribe`, `all`, `durable` (live + historical stream), `project` (atomic projectors), `replay`, `replayAll`, `remove`, `claim`.

Core commit logic in `commitDurableEvent` (`event.ts:205-367`): runs inside a transaction with `{ behavior: "immediate" }`. Validates sequence continuity, checks replay ownership, runs registered projectors atomically, upserts sequence row, inserts event row, wakes durable subscribers via per-aggregate `PubSub`.

## Build & Workspaces

### Workspace Layout

`package.json:25-32`:
```json
"workspaces": {
  "packages": [
    "packages/*",
    "packages/console/*",
    "packages/stats/*",
    "packages/sdk/js",
    "packages/slack"
  ]
}
```

Package manager: `bun@1.3.14` (`package.json:7`). Catalog system for shared dependency versions (`package.json:33-96`).

### Turborepo

`turbo.json` defines:
- `typecheck` — no dependencies, no outputs
- `build` — no dependencies, outputs `dist/**`
- `opencode#test` — depends on `^build`, pass-through env `*`
- `@opencode-ai/core#test`, `@opencode-ai/app#test`, `@opencode-ai/ui#test`, `@opencode-ai/session-ui#test` — depend on `^build`
- `@opencode-ai/function#test` — no build dependency

### Commands

```bash
# Typecheck all packages
bun typecheck                          # root — runs bun turbo typecheck
# Typecheck single package
cd packages/core && tsgo --noEmit

# Lint
bun lint                               # root — runs oxlint (type-aware)

# Test — MUST run from package dirs, not root
cd packages/core && bun test --only-failures
cd packages/effect-drizzle-sqlite && bun test --timeout 30000 --only-failures
cd packages/http-recorder && bun test --timeout 30000 --only-failures
cd packages/opencode && bun test --timeout 30000 --only-failures
cd packages/function && bun test

# Build
cd packages/opencode && bun run script/build.ts
cd packages/cli && bun run script/build.ts

# Dev
bun dev                                # root — runs packages/opencode/src/index.ts
bun dev:desktop                        # Electron desktop
bun dev:web                            # Web UI
bun dev:console                        # Console app
```

Root test guard: `bunfig.toml:8` sets `root = "./do-not-run-tests-from-root"`. `package.json:23` reinforces: `"test": "echo 'do not run tests from root' && exit 1"`.

Core test preload (`packages/core/bunfig.toml:2`, `packages/core/test/preload.ts:1-6`): sets `OPENCODE_DB=:memory:`, `NPM_CONFIG_AUDIT=false`, `OPENCODE_MODELS_PATH` to fixture, `OPENCODE_DISABLE_MODELS_FETCH=true`.

## Codegen & CI

### Codegen Flows

**SDK generation** (`script/generate.ts`):
1. `bun ./packages/sdk/js/script/build.ts`
2. `bun dev generate > ../sdk/openapi.json` from `packages/opencode`
3. `./script/format.ts`

**Client codegen**: After changing public Protocol or Server HttpApi, run `bun run generate` from `packages/client` (`packages/client/package.json:12`). Generated files in `src/generated` and `src/generated-effect`.

**Migration generation**: `bun script/migration.ts` from `packages/core`.

### CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | push to dev, PRs | Unit tests (Linux + Windows), e2e (Playwright), client freshness check, HttpApi exerciser |
| `typecheck.yml` | push to dev, PRs | `bun typecheck` |
| `deploy.yml` | push to dev/production | `bun sst deploy --stage=<ref>` |
| `publish.yml` | push to ci/dev/beta/snapshot-* | Full release pipeline |
| `generate.yml` | push to dev | Auto-commit generated code |
| `review.yml` | PR comment `/review` | AI-powered PR review |
| `containers.yml` | push to dev (containers paths) | Build/push CI container images |

All third-party actions pinned to full SHA commits.

## Release & Deploy

### Publish Pipeline (`.github/workflows/publish.yml`)

1. **Version** (`script/version.ts`): Determines version, creates GitHub release draft
2. **Build CLI**: `packages/opencode/script/build.ts` + `packages/cli/script/build.ts` (linux, mac, windows)
3. **Sign Windows CLI**: Azure Trusted Signing via OIDC. Signs all 3 Windows executables (arm64, x64, x64-baseline). Repacks into ZIPs.
4. **Build Electron**: 6-target matrix (macOS x64/arm64, Windows arm64/x64, Linux x64/arm64). Apple codesigning + notarization for macOS. Azure signing for Windows.
5. **Publish** (`script/publish.ts`): npm publish (SDK, plugin, UI, CLI), Docker images to GHCR, AUR package via SSH, git tag, desktop `latest.yml` finalization.

### Deploy Pipeline (`.github/workflows/deploy.yml`)

AWS credential assumption via OIDC. `bun sst deploy --stage=<ref>` with secrets for Cloudflare, PlanetScale, Stripe, Honeycomb, Sentry.

### SST Topology (`sst.config.ts` + `infra/`)

| Resource | Domain | Owner |
|----------|--------|-------|
| API Worker + Durable Objects | `api.<domain>` | opencode-core |
| Web (Astro docs) | `docs.<domain>` | opencode-core |
| WebApp (SolidJS) | `app.<domain>` | opencode-core |
| Auth Worker | `auth.<domain>` | console |
| Console (SolidStart) | `<domain>` | console |
| Stats (SolidStart) | `stats.<domain>` | stats |
| Enterprise (SolidStart) | `opncd.ai` | enterprise |
| Lake Ingest (ECS Fargate) | `lake.<domain>` | stats |
| StatsSync (ECS Fargate) | — | stats |
| PlanetScale `opencode` | — | console |
| PlanetScale `opencode-stats` | — | stats |
| S3 Tables + Firehose + Athena | — | stats |
| R2 Buckets (3) | — | core/console/enterprise |
| Stripe products/prices | — | console |
| Honeycomb triggers (6) | — | monitoring |

## Nix/Docker/Containers

### Nix

`flake.nix` provides dev shells (Bun, Node.js 20, pkg-config, openssl, git) and packages:
- `opencode` (`nix/opencode.nix`): Standalone binary via `bun ./script/build.ts --single`, shell completions, ripgrep wrapper
- `opencode-desktop` (`nix/desktop.nix`): Electron app, ad-hoc macOS signing, Linux desktop entry with Wayland

### Docker / Containers

`packages/containers/` — CI container images (Ubuntu 24.04 base) published to `ghcr.io/anomalyco/build/<name>:24.04`:
- `base` → `bun-node` → `rust` → `tauri-linux`
- `bun-node` → `publish`

`packages/stats/server/Dockerfile` — multi-stage Bun Alpine build for stats server (turbo prune → frozen install → run).

## Peripheral Services

| Package | Purpose | Deploy Target |
|---------|---------|---------------|
| `function` | Cloudflare Worker API (Hono), Durable Objects, R2, GitHub App auth | `api.<domain>` |
| `enterprise` | SolidStart team management app, R2 storage | `opncd.ai` |
| `stats/core` | PlanetScale MySQL + Athena queries + R2 SQL | — |
| `stats/server` | HTTP server for lake ingestion, Firehose writer | ECS Fargate |
| `stats/app` | SolidStart analytics dashboard | `stats.<domain>` |
| `slack` | Slack bot via `@slack/bolt` + OpenCode SDK | Self-hosted |
| `cli` | Preview CLI (`lildax` binary) | npm |
| `identity` | Brand assets (SVG/PNG) | — |

## Testing Infrastructure

### Test Distribution

| Package | Test Files | Notes |
|---------|-----------|-------|
| `core` | 87+ | Session, event, tools, migration, PTY, plugins, providers |
| `opencode` | 60+ | Session, tools, storage, format, share |
| `app` | 80+ | Browser tests, UI, sync, session, prompts |
| `tui` | 30 | Utils, prompt, plugin, CLI |
| `desktop` | 15 | Main process, renderer, WSL, updater |
| `llm` | 20+ | Provider tests (recorded cassettes) |
| `schema` | 6 | Event manifests, compatibility |
| `session-ui` | 14 | Markdown, diff, prompt input |
| `server` | **0** | No tests |
| `slack` | **0** | No tests |
| `stats/app` | **0** | No tests |
| `stats/server` | **0** | No tests |

### HTTP Recorder

`@opencode-ai/http-recorder` (`packages/http-recorder/`) provides cassette-based HTTP/WebSocket recording for tests. First local run records to `test/fixtures/recordings/<name>.json`; subsequent runs replay. `CI=true` fails on missing cassettes. Secret scanning prevents credential leakage before write (`cassette.ts:69-70`). Used by `core` and `llm` provider tests.

## Security Posture

### Findings

| Severity | Finding | Location |
|----------|---------|----------|
| **HIGH** | Credentials stored as plaintext JSON in SQLite | `credential/sql.ts:9` — `value: text({ mode: "json" })` |
| **HIGH** | Password comparison uses `===` (not constant-time) | `server/src/auth.ts:48` — `Redacted.value(credentials.password) === config.password.value` |
| **MEDIUM** | Location middleware trusts client-supplied `x-opencode-directory` header | `server/src/location.ts:29-38` |
| **MEDIUM** | PTY connect skips auth at middleware level (handler validates) | `server/src/middleware/authorization.ts:46-48` |
| **MEDIUM** | CORS allows all `http://localhost:*` origins | `server/src/cors.ts:13-14` |
| **MEDIUM** | `OPENCODE_DB` env can point to arbitrary file | `core/src/database/database.ts:44-46` |
| **LOW** | PTY ticket 60s TTL (single-use mitigates) | `core/src/pty/ticket.ts:9` |
| **LOW** | npm provenance disabled | `.github/workflows/publish.yml:514` |

### Positive Controls

- Path traversal protection in `filesystem.ts:66-71` (double-check with `realPath()`)
- Skill discovery path validation (`skill/discovery.ts:15-53`) with `FSUtil.contains()` and origin checks
- PTY ticket CORS preflight enforcement (`pty.ts:119-125`)
- HTTP recorder secret scanning with 7 pattern categories (`redaction.ts:30-38`)
- All GitHub Actions pinned to SHA commits
- AWS deploy uses OIDC, not long-lived keys (`deploy.yml:30-34`)

## Observability

- **Logging**: Structured `key=value` to file (`~/.local/share/opencode/log/opencode.log`). Conditional stderr via `OPENCODE_PRINT_LOGS=1`. Level via `OPENCODE_LOG_LEVEL` (`observability/logging.ts:56-64`).
- **Tracing**: OpenTelemetry via `OTEL_EXPORTER_OTLP_ENDPOINT` env. `BatchSpanProcessor` with OTLP exporter (`observability/otlp.ts:55-77`). Global `AsyncLocalStorageContextManager` for AI SDK span parenting.
- **OTLP Logs**: `OtlpLogger` sends to `${endpoint}/v1/logs` (`otlp.ts:50-53`).
- **Honeycomb**: 6 alert triggers for model errors, low TPS, provider errors, free-tier usage (`infra/monitoring.ts:160-287`). Discord webhook alerts.
- **Sentry**: Configured for web and desktop apps in CI.
- **Gaps**: No metrics export (traces/logs only). Server request logging disabled (`routes.ts:68`). No uptime monitoring.

## Known Risks

1. **`server/` has zero tests** — the entire HTTP API layer (auth, CORS, PTY connect, filesystem, sessions, permissions, credentials) is untested.
2. **Generated artifacts only checked on Linux** — `schema.gen.ts` and `migration.gen.ts` freshness gates run only in Linux CI (`database-migration.test.ts:116`), not Windows.
3. **Plaintext credential storage** — OAuth tokens and API keys stored as JSON in unencrypted SQLite.
4. **Non-constant-time password comparison** — `auth.ts:48` uses `===` for password check.
5. **npm provenance disabled** — packages cannot be cryptographically linked to source.
6. **Blacksmith runners** — third-party hosted runners with elevated trust boundary.

## Open Questions

1. Should credentials be encrypted at rest (e.g., OS keychain, SQLite encryption extension)?
2. Should `server/` gain integration tests covering auth, CORS, and PTY connect flows?
3. Should migration freshness checks run on all CI platforms, not just Linux?
4. Should npm provenance be enabled for supply chain transparency?
5. Is the `OPENCODE_PERMISSION` env injection vector acceptable for production use?

=====================================================================

# Appendix A — Cross-Cutting Risk Register

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | Critical | Core/Session | V1 and V2 session stacks coexist; V2 runner is fully wired but `SessionV2.prompt()` is never called in production |
| 2 | Critical | Embedded | `sdk-next` request scope lifetime is unenforced for streaming bodies |
| 3 | High | Contract | Dual HTTP clients (`@opencode-ai/sdk` legacy vs `@opencode-ai/client`) with a runtime compat proxy |
| 4 | High | Contract | Event type bridging maps V2 events to V1 names manually |
| 5 | High | Persistence | All SQLite access serialized through `Semaphore.make(1)` |
| 6 | High | Concurrency | No concurrency guard on `SessionRunner.run()` for the same session |
| 7 | High | Events | Owner claims are non-transactional (last-writer-wins) |
| 8 | High | Security | Credentials stored as plaintext JSON in SQLite |
| 9 | High | Security | Password comparison is not constant-time |
| 10 | High | UI | App uses a vendored `@opencode-ai/client` tgz (v1.17.13), not the workspace package |
| 11 | High | Build | SDK v2 generated code has no CI freshness gate |
| 12 | High | Build | `@modelcontextprotocol/sdk` patch is a 647-line behavioral fork |
| 13 | High | Testing | `packages/server` has zero tests |
| 14 | Medium | Concurrency | Session move does not interrupt/migrate active execution |
| 15 | Medium | Build | Core migration `--check` runs only on Linux |
| 16 | Medium | Build | Turbo `typecheck` has no `dependsOn` ordering |
| 17 | Medium | Supply chain | 8 `@ai-sdk/*` patches tightly coupled to versions |
| 18 | Medium | Security | Location middleware trusts client-supplied directory header |
| 19 | Medium | Security | CORS allows all localhost origins |
| 20 | Medium | Observability | No metrics export; server request logging disabled |

# Appendix B — Development Commands

```bash
bun install                     # install workspace deps
bun dev                         # run the main CLI/runtime
bun dev:desktop                 # Electron desktop
bun dev:web                     # web UI
bun dev:console                 # console app
bun typecheck                   # all packages via turbo
bun lint                        # oxlint (type-aware)
bun run generate                # from packages/client: regenerate client code
cd packages/core && bun script/migration.ts          # generate migrations
cd packages/core && bun script/migration.ts --check  # verify migrations
cd packages/core && bun test --only-failures         # package tests (never from root)
```
