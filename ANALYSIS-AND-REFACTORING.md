# OpenCode — Analysis & Refactoring Guide

> Integrated analysis synthesized from a 5-domain × 4-round read-only reviewer survey (20 review passes) of the OpenCode monorepo at commit on `dev` (2026-09-12). This document is the analytical companion to `ARCHITECTURE.md` (which is descriptive). This one is diagnostic and prescriptive: it inventories duplication, boundaries, risks, and proposes a prioritized refactoring roadmap.
>
> `path:line` anchors reflect the surveyed commit and may drift.

## 1. Purpose & Method

**Goal:** give a development team an accurate map of the system plus a prioritized, dependency-aware refactoring plan.

**Method:** five independent reviewer sessions, each owning one domain, run through four rounds:
- **Round 1 — Breadth:** package layout, entry points, dependency edges.
- **Round 2 — Deep dive:** concrete call chains and data flows with `path:line` anchors.
- **Round 3 — Cross-cutting:** dependency direction, duplication, concurrency/lifecycle, build/codegen, testing/security/observability.
- **Round 4 — Synthesis:** doc-ready domain sections, contradiction resolution, gap validation.

**Domains:** (A) Core runtime; (B) Contract/Server/SDK; (C) LLM/Providers/CodeMode/Plugins; (D) UI; (E) Persistence/Infra/Tooling.

**Confidence:** high for structure and call chains; medium for "active vs dormant" status where feature flags gate behavior; low for anything requiring running code (e.g., whether generated artifacts are byte-identical to a fresh compile).

## 2. Executive Summary

The repository is a large, ambitious, actively-migrating monorepo. Its most important characteristic is that **two generations of nearly every subsystem coexist simultaneously**, with the newer generation partially wired but not fully live. This is the dominant source of complexity, maintenance cost, and risk.

### 2.1 The Ten Most Important Findings

| # | Finding | Severity | Domain |
|---|---------|----------|--------|
| 1 | **V1 and V2 session stacks coexist.** V1 (`packages/opencode/src/session/`) is the live execution path for HTTP/TUI/CLI; V2 (`packages/core/src/session/runner/`) is fully implemented and wired into the server layer graph but `SessionV2.prompt()` is never called in production. | Critical | Core |
| 2 | **Two HTTP client generations coexist.** Legacy `@opencode-ai/sdk` (OpenAPI/@hey-api) and `@opencode-ai/client` (Effect HttpApi codegen) are both live; the web app uses both behind a runtime compat proxy. | High | Contract |
| 3 | **The embedded host `@opencode-ai/sdk-next` has no production consumers** and its streaming request-scope lifetime is unenforced. | Critical | Contract |
| 4 | **All SQLite access is serialized through `Semaphore.make(1)`**, negating WAL read concurrency; long event-commit transactions block everything. | High | Infra |
| 5 | **No concurrency guard on `SessionRunner.run()`** per session; concurrent `resume`+`wake` could produce duplicate provider turns. | High | Core |
| 6 | **Credentials are stored as plaintext JSON in SQLite**, and server password comparison is not constant-time. | High | Security |
| 7 | **`packages/server` has zero tests**, yet it owns auth, CORS, PTY connect, filesystem, sessions, permissions, and credentials. | High | Testing |
| 8 | **The web app consumes a vendored `@opencode-ai/client` tarball (v1.17.13)**, not the workspace package, so it drifts from `packages/client`. | High | UI |
| 9 | **Codegen freshness gates are partial**: client generated code is checked in CI; SDK v2 generated code and core migration artifacts are not (or only on Linux). | High | Build |
| 10 | **The dependency rule "UI must not import Core domain" is violated by the TUI** (`core/global`, `core/flag`, `core/installation/version`), and `session-ui`/`app` reach into `core/util/*`. | Medium | UI |

### 2.2 The Central Theme

Every critical/high finding is a variation of one theme: **a migration is in flight, and the old and new paths are both present, both partially authoritative, and neither fully retired.** The single highest-leverage strategic decision is to choose, per subsystem, either to *finish the migration and delete the old path* or to *freeze and remove the new path*. Continuing to carry both is the root cause of most risk in this document.

## 3. System Map

### 3.1 Package Dependency Direction (verified)

```
schema ──▶ (nothing)
protocol ──▶ schema
llm ──▶ schema
server ──▶ protocol, core
client ──▶ schema, protocol            (runtime; core/server are devDeps for codegen)
sdk-next ──▶ client, core, server      (embedded host)
plugin ──▶ sdk (legacy)
core ──▶ schema, llm, plugin, effect-drizzle-sqlite, effect-sqlite-node, drizzle-orm, AI SDK providers, watchers, pty
tui ──▶ core, plugin, sdk, ui, opentui/*
app ──▶ core (util only), schema, sdk, client (vendored tgz), session-ui, ui
session-ui ──▶ core (util only), sdk, client (vendored tgz), ui
desktop ──▶ app, ui
cli ──▶ core, sdk, server, tui
opencode ──▶ core, llm, plugin, protocol, schema, sdk, server, tui
slack ──▶ sdk
```

The graph is a DAG (no package cycles), but there is a long transitive chain: `core → plugin → sdk (legacy)`, so every `core` consumer transitively pulls the legacy SDK.

### 3.2 Two Scope Axes in the Runtime

- **global** (process singleton): `Database`, `EventV2`, `SessionExecution`, `SessionStore`, `LocationServiceMap`, `ProjectV2`, `MoveSession`.
- **location** (per working directory, 60-min idle TTL): `Location`, `Policy`, `Config`, `AgentV2`, `CommandV2`, `Reference`, `Integration`, `Catalog`, `AISDK`, `PluginV2`, `PluginInternal`, `FileSystem`, `Watcher`, `Pty`, `SkillV2`, `SystemContextRegistry`, `PermissionV2`, `ToolRegistry`, `SessionRunnerModel`, `SessionRunnerLLM`, `Snapshot`.

`SessionExecution` is global but `SessionRunner` is location-scoped; this split is the source of the session-move and concurrency risks in §6.

### 3.3 The "Two of Everything" Inventory

| Concern | Old / Live | New / Partial | Authoritative today |
|---|---|---|---|
| Session execution | `packages/opencode/src/session/prompt.ts` (V1) | `packages/core/src/session/runner/` (V2) | **V1** |
| Session/message schema | `packages/schema/src/v1/session.ts` | `packages/schema/src/session*.ts` | Mixed |
| HTTP client | `@opencode-ai/sdk` (OpenAPI) | `@opencode-ai/client` (HttpApi codegen) | **`client`** for new API |
| Embedded host | — | `@opencode-ai/sdk-next` | unused |
| Plugin API | `packages/plugin/src/index.ts` (v1) | `packages/plugin/src/v2/**` | **both** |
| UI components | `src/components/*` | `src/v2/components/*` | both |
| Web app client | `@opencode-ai/sdk/v2` | `@opencode-ai/client` (vendored) | both via proxy |
| Event manifest | `EventManifest.Definitions` | `EventManifest.ServerDefinitions` | both |
| Session concurrency | `SessionRunState` (V1) | `SessionRunCoordinator` (V2) | **V1** |

## 4. Domain Analysis

### 4.1 Core Runtime

**Live path.** A `session.prompt` over HTTP resolves to `packages/server/src/handlers/session.ts:300`, which calls the **V1** `SessionPrompt.Service` (`packages/opencode/src/session/prompt.ts:1052`). The V1 `runLoop` (`prompt.ts:1081`) is a `while(true)` tool loop using AI SDK primitives, `SessionTools.resolve()` (`packages/opencode/src/session/tools.ts:41`), and `SessionProcessor` (`packages/opencode/src/session/processor.ts:79`).

**Dormant path.** The **V2** runner chain is `SessionV2.prompt` (`packages/core/src/session.ts:360`) → `SessionInput.admit` (`session/input.ts:41`) → `SessionExecution.wake` → `SessionRunCoordinator.wake` (`session/run-coordinator.ts:81`) → `SessionRunner.run` (`session/runner/llm.ts:390`) → `llm.stream` (`runner/llm.ts:239`) → tool settlement (`runner/llm.ts:257-278`). The server wires `SessionExecutionLocal` at `server.ts:298-303`, but no handler yields `SessionV2.Service`; the only caller is a test (`packages/core/test/session-prompt.test.ts:101`).

**What V2 *does* provide live:** the event bus (`event.ts:150`), the shared session projector (`session/projector.ts`), durable input admission (`session/input.ts`), and context epochs (`session/context-epoch.ts`) — the latter two are only exercised by the dormant runner.

**System Context.** The algebra (`system-context/index.ts`) models typed refreshable `Source<A>` values with `initialize`/`reconcile`/`replace`. Context epochs persist an immutable baseline plus a snapshot (`session/context-epoch.ts:23,31`). Compaction triggers full replacement when `compaction.seq > stored.baseline_seq` (`context-epoch.ts:59`). All of this is **dormant** (only the V2 runner calls it).

**Tools.** V2 tool model: `Tool.make` (`tool/tool.ts:71`), `ToolRegistry.materialize` (`tool/registry.ts:106`), output bounding via `ToolOutputStore.bound` (`tool-output-store.ts:138`, 2000 lines / 50 KB / 7-day retention). Dormant in the live path.

**Events.** `EventV2` writes durable events transactionally (`event.ts:205-367`), running projectors in the same transaction. Both stacks publish to it; `SessionProjector` (`projector.ts:210-453`) projects ~25 event types into SQLite. This shared event/projection layer is the bridge that makes coexistence possible.

**Plugins.** V2 plugin service (`plugin.ts:29`) is location-scoped and *is* integrated (internal + external providers use `@opencode-ai/plugin/v2/*`). V1 hooks (`packages/plugin/src/index.ts:222-335`) are still used by the V1 session layer. Both coexist.

**PTY.** Transport-free abstraction (`pty/pty.ts`), Bun/Node implementations, WebSocket protocol (`pty/protocol.ts`), single-use 60s tickets (`pty/ticket.ts`).

**Core-specific problems:**
- V1/V2 duality (§5.1) with a shared event/projector bridge.
- `Effect.die` used as control flow for compaction/overflow transitions (`runner/llm.ts:223`, caught by `catchDefect` at `:376-388`).
- `SessionRunCoordinator` instantiated but idle in production.
- `core` is monolithic: 17 AI SDK providers, native PTY, image processing, npm internals as runtime deps.

### 4.2 Contract, Server & SDK

**Layering.** `schema → protocol → server`; `client` runtime depends only on `schema` + `protocol`. Enforced by `packages/client/test/import-boundaries.test.ts` (bundles browser target and asserts no `effect`/`schema`/`protocol`/`core`/`server` inputs for the root entrypoint).

**Schema.** `@opencode-ai/schema` is the semantic leaf; Core re-exports by reference identity, verified by `packages/client/test/contract-identity.test.ts:25-31` (`AgentV2.ID === Agent.ID`, etc.).

**Protocol.** 18 `HttpApi` groups under `/api/*` (plus an experimental project-copy group). Middleware placement lives in Protocol (`packages/protocol/src/api.ts:26-64`); Server injects concrete keys (`packages/server/src/api.ts:1-8`). 13 tagged errors with HTTP statuses (`packages/protocol/src/errors.ts`).

**Server.** Handlers one-per-group (`packages/server/src/handlers.ts`), routes assembled at `packages/server/src/routes.ts:51-62`. `createEmbeddedRoutes()` (`routes.ts:47-49`) disables auth for in-process use.

**Codegen.** `packages/client/script/build.ts` compiles `ClientApi` into an IR via `packages/httpapi-codegen`, then emits a zero-Effect Promise client (`src/generated/`) and an Effect client (`src/generated-effect/`). CI gate: `check:generated` (`packages/client/package.json:13`, run in `.github/workflows/test.yml:72-75`).

**SDKs.** `@opencode-ai/sdk` (legacy, OpenAPI/@hey-api, published, used by `plugin`/`tui`/`app`/`cli`/`slack`) vs `@opencode-ai/client` (new contract source of truth) vs `@opencode-ai/sdk-next` (embedded, unused).

**Contract-specific problems:**
- Dual client generations and a runtime compat proxy (`packages/app/src/utils/server-compat.ts:86-92`).
- Manual V2→V1 event name mapping (`packages/app/src/context/server-sdk.tsx:28-56`).
- `sdk-next` unused; embedded streaming scope unenforced (`CONTEXT.md:216`).
- SDK v2 generated code lacks a CI freshness gate.

### 4.3 LLM, Providers, CodeMode & Plugins

**LLM package.** A `Route` composes Protocol + Endpoint + Auth + Framing (`packages/llm/src/route/client.ts:307-339`). Six protocols, 11 provider facades, HTTP + WebSocket transports, composable auth, and a retrying `RequestExecutor` (2 retries, 429/503/504/529).

**Runtime selection.** Default is the **AI SDK** path (`packages/opencode/src/session/llm.ts:280-353`). The native `@opencode-ai/llm` path is gated by `OPENCODE_EXPERIMENTAL_NATIVE_LLM` (`runtime-flags.ts:54`, default false) and supports only `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` (`llm/native-runtime.ts:55-59`). Both emit the same `LLMEvent` stream.

**Catalog.** `models.dev` snapshot is ACTIVE (`packages/core/src/models-dev.ts:202-261`), refreshed hourly, cached to disk, with a bundled fallback. Options split into generation controls vs provider-keyed options vs raw HTTP overlays (`packages/llm/src/schema/options.ts`).

**CodeMode.** Confined tree-walking JS interpreter (no `eval`), 8 concurrent tool calls, depth 32, sandbox `copyIn`/`copyOut` boundary (`packages/codemode/src/tool-runtime.ts:171-314`). Gated by `OPENCODE_EXPERIMENTAL_CODE_MODE`.

**Plugins.** V1 hooks and V2 effect/promise plugins coexist and are both active in different layers.

**LLM-specific problems:**
- Native runtime is a partial second implementation of provider orchestration.
- Catalog → native route mapping only supports 3 npm packages (`runner/model.ts:131-170`); other providers are AI-SDK-only.
- V1/V2 plugin duality.

### 4.4 User Interfaces

**TUI** (`@opentui/core` + `@opentui/solid`): ~25-layer provider tree (`packages/tui/src/app.tsx:246-351`), single `createStore` (`context/sync.tsx:70`), manual routing, keymap/command palette, plugin slots/routes. Uses **only** `@opencode-ai/sdk/v2` (`context/sdk.tsx:1`).

**Web app** (SolidJS + Vite): five-tier provider hierarchy, dual HTTP clients, 16ms event coalescing, directory-keyed event reducer (`context/global-sync/event-reducer.ts`), optimistic prompt submission (`components/prompt-input/submit.ts`). ~30 V1→V2 API migration items remain (`packages/app/V1_API_MIGRATION.md`).

**Desktop** (Electron 42, not Tauri): main/preload/renderer, sidecar server (v1 default, v2 behind `OPENCODE_SIDECAR_V2`), 70+ IPC methods, renderer reuses `@opencode-ai/app`.

**Shared components:** `@opencode-ai/ui` (leaf primitives) and `@opencode-ai/session-ui` (session components), each with parallel `components/` and `v2/components/` trees; markdown pipeline via worker + LRU cache + DOMPurify + morphdom.

**UI-specific problems:**
- TUI is on the legacy client with no migration path.
- App/session-ui use a vendored `@opencode-ai/client` tgz (v1.17.13), drifting from workspace.
- TUI imports core domain modules (`core/global`, `core/flag/flag`, `core/installation/version`) beyond `core/util/*`.
- `session-ui` imports `core/util/*`, coupling a UI library to the core package.

### 4.5 Persistence, Infrastructure & Tooling

**Database.** SQLite via a generic Drizzle↔Effect adapter (`@opencode-ai/effect-drizzle-sqlite`), with `bun:sqlite` and `node:sqlite` implementations behind `#sqlite` subpath imports. Single-connection semaphore + WAL pragmas (`packages/core/src/database/database.ts:27-32`).

**Migrations.** Custom TypeScript migrations (not Drizzle runtime). `apply()` dispatches between full-schema bootstrap and incremental `applyOnly()` (`packages/core/src/database/migration.ts:18-107`), with a legacy `__drizzle_migrations` import path. 38 timestamped migrations; generated registry + full schema (`migration.gen.ts`, `schema.gen.ts`). Generation via `packages/core/script/migration.ts`, with a `--check` mode.

**Event store.** `event_sequence` + `event` tables (`packages/core/src/event/sql.ts`), transactional `commitDurableEvent` (`event.ts:205-367`), owner claims (`event.ts:525-532`), replay/replayAll with divergence detection.

**Build.** Bun workspaces + Turborepo. `bun typecheck` (tsgo), `bun lint` (oxlint), tests only from package dirs (root guard in `bunfig.toml:8`). Core test preload forces `:memory:` DB and offline model fixture.

**Cloud.** SST v4 on Cloudflare + AWS + PlanetScale + Stripe + Honeycomb. CI on Blacksmith runners. Release pipeline signs CLI (Azure) and Electron (Apple + Azure), publishes npm/Docker/AUR.

**Infra-specific problems:**
- Migration `--check` runs only inside a Linux-gated test, not as a workflow step.
- SDK v2 generated code and (on Windows) migration artifacts lack freshness gates.
- 20 dependency patches, including a 647-line behavioral fork of `@modelcontextprotocol/sdk`, a `solid-js` runtime patch, and an `effect` patch.
- `@solidjs/start` pinned to an ephemeral PR preview URL.

## 5. Cross-Cutting Analysis

### 5.1 Duplication Inventory

| Duplicated concern | Locations | Cost | Recommendation |
|---|---|---|---|
| Session execution | V1 `opencode/src/session/*` vs V2 `core/src/session/runner/*` | Every session behavior change must be made twice; two concurrency models; two message shapes | Pick one; retire the other |
| Session/message schema | `schema/src/v1/session.ts` vs `schema/src/session*.ts` | 676-line V1 schema maintained for durable-log compatibility | Freeze V1 schema read-only; stop writing it |
| HTTP clients | `@opencode-ai/sdk` vs `@opencode-ai/client` vs `sdk-next` | Three surfaces, two codegen pipelines, runtime proxy | Make `client` canonical; keep `sdk` as a generated compatibility artifact or deprecate |
| Plugin API | `plugin/src/index.ts` vs `plugin/src/v2/**` | Two hook models active in different layers | Converge on v2; wrap v1 as adapters |
| UI components | `ui`/`session-ui` `components/` vs `v2/components/` | Duplicate implementations and styles | Complete v2 and delete v1 |
| Event manifests | `EventManifest.Definitions` vs `ServerDefinitions` | Two event surfaces with manual bridging | Generate the client-facing subset from the durable set |
| Session concurrency | `SessionRunState` (V1) vs `SessionRunCoordinator` (V2) | Two serialization mechanisms | Keep one after session-stack decision |
| Branded IDs | `SessionMessage.ID`, V1 `MessageID`/`PartID`, `opencode` `MessageID`/`PartID` | Three brands for the same concept | Consolidate in Schema |

### 5.2 Dependency & Layering

**Verified violations:**
- **TUI imports core domain** (`tui/src/app.tsx:5-7`, `context/kv.tsx:5`, `context/theme.tsx:27`, `context/sdk.tsx:3`, `ui/dialog.tsx:7`, `component/prompt/index.tsx:17`, `component/dialog-debug.tsx:3`, `routes/session/sidebar.tsx:6`, `component/error-component.tsx:6`): `core/global`, `core/flag/flag`, `core/installation/version`.
- **`session-ui` and `app` import `core/util/*`**: technically outside the documented "client/UI must not import Core" rule, though the modules are pure utilities.
- **`plugin → sdk (legacy)` while `core → plugin`**: forces the legacy SDK into every `core` consumer's transitive graph.
- **`core` monolith**: pulling one utility transitively pulls all providers/PTY/native deps.

**Enforcement gap:** only the client boundary is test-enforced. There is no lint/CI rule preventing UI packages from importing `core` domain modules or `server`.

### 5.3 Concurrency & Lifecycle Risks

- **Embedded streaming scope (Critical):** `sdk-next/src/opencode.ts:10-43` ties all resources to the caller scope; nothing keeps the request scope alive until a streamed body is consumed (`CONTEXT.md:216`).
- **Runner concurrency (High):** `SessionRunner.run()` (`runner/llm.ts:390-413`) has no per-session guard; `SessionExecution`'s `noopLayer` (`execution.ts:26-33`) suggests the guard was meant to live there. Concurrent `resume`+`wake` could double-run a turn.
- **SQLite serialization (High):** `Semaphore.make(1)` in both drivers serializes reads and writes; WAL's concurrent-read benefit is unused. Long event transactions (with projectors) block all DB access.
- **Owner claims (High):** `event.ts:525-532` is a bare UPDATE with no transaction/optimistic check; last-writer-wins.
- **Session move (Medium):** `control-plane/move-session.ts:77-138` does not interrupt or migrate active execution; the runner detects a location mismatch on the next turn (`runner/llm.ts:180-181`), so the current turn runs with stale location context.
- **FiberSet cleanup (Medium):** `TurnTransitionError` retries (`runner/llm.ts:378-387`) create new FiberSets; old tool fibers may outlive their attempt.
- **Process-global memo map (Low):** `effect/memo-map.ts:3` never finalizes.

### 5.4 Build, Codegen & CI

| Artifact | Committed | Freshness gate |
|---|---|---|
| `packages/client/src/generated{,effect}` | yes | **yes** — `check:generated` in `test.yml:72-75` |
| `packages/sdk/js/src/v2/gen` (+ legacy `src/gen`) | yes | **no** |
| `packages/core/src/database/{migration.gen,schema.gen}.ts` | yes | only via Linux-gated test (`database-migration.test.ts:116`) |
| OpenAPI JSON / models.dev snapshot | n/a (build-time) | n/a |

Other build issues: Turbo `typecheck` and `build` have empty `dependsOn`; several packages with test/typecheck scripts lack turbo overrides; 20 patches with no CI "patches still apply" verification.

### 5.5 Testing

Strong suites: `core` (87+), `opencode` (60+), `app` (80+), `llm` (cassette-based), `schema`, `session-ui`, `tui`, `desktop`. Cassette record/replay with secret scanning (`@opencode-ai/http-recorder`).

Gaps: **`packages/server` has zero tests** (auth, CORS, PTY connect, fs, sessions, permissions, credentials). Also zero: `slack`, `stats/app`, `stats/server`, `plugin`, `containers`, `identity`, `web`. No integration test exercises the full HTTP request → middleware → handler → Core path.

### 5.6 Security

| Severity | Finding | Location |
|---|---|---|
| High | Credentials stored as plaintext JSON in SQLite | `packages/core/src/credential/sql.ts:9` |
| High | Password comparison not constant-time (`===`) | `packages/server/src/auth.ts:48` |
| Medium | Location middleware trusts client-supplied directory header/query | `packages/server/src/location.ts:29-38` |
| Medium | PTY connect skips auth at middleware (handler validates ticket) | `packages/server/src/middleware/authorization.ts:46-48` |
| Medium | CORS allows all `localhost`/`127.0.0.1` origins | `packages/server/src/cors.ts:13-14` |
| Medium | `OPENCODE_DB` can point to an arbitrary file | `packages/core/src/database/database.ts:44-46` |
| Medium | `OPENCODE_PERMISSION` env injects permission rules | `packages/core/src/flag/flag.ts:69-71` |
| Low | PTY ticket TTL 60s (single-use mitigates) | `packages/core/src/pty/ticket.ts:9` |
| Low | npm provenance disabled | `.github/workflows/publish.yml:514` |

Positive controls: double `realPath` traversal checks (`filesystem.ts:66-71`), skill-discovery path validation (`skill/discovery.ts:15-53`), PTY CORS preflight for ticket minting (`pty.ts:119-125`), recorder secret scanning, SHA-pinned actions, OIDC for AWS/Azure.

### 5.7 Observability

Present: structured file logging, OTLP traces/logs (`observability/otlp.ts`), 6 Honeycomb alert triggers, Sentry for web/desktop.

Gaps: no metrics export; server request logging disabled (`routes.ts:68`); no uptime monitoring; local CLI errors are file-only.

## 6. Consolidated Risk Register

Ranked by (severity × likelihood × blast radius).

| ID | Sev | Area | Risk | Evidence | Blast radius |
|----|-----|------|------|----------|--------------|
| R-01 | Critical | Core | V1/V2 session stacks both present; V2 unwired | `session.ts:360`, `handlers/session.ts:300`, `runner/llm.ts:390` | Every session feature; developer confusion |
| R-02 | Critical | Embedded | Streaming scope lifetime unenforced | `sdk-next/src/opencode.ts:10-43`, `CONTEXT.md:216` | Embedded/event-stream consumers |
| R-03 | High | Concurrency | No per-session run guard | `runner/llm.ts:390-413`, `execution.ts:26-33` | Duplicate turns/tool calls |
| R-04 | High | Infra | Single SQLite semaphore serializes all I/O | `sqlite.{bun,node}.ts`, `database.ts:27-32` | Throughput under multiple sessions |
| R-05 | High | Events | Non-transactional owner claims | `event.ts:525-532` | Multi-process event correctness |
| R-06 | High | Security | Plaintext credentials at rest | `credential/sql.ts:9` | Credential disclosure |
| R-07 | High | Security | Non-constant-time password compare | `server/src/auth.ts:48` | Credential brute-force (networked servers) |
| R-08 | High | Contract | Dual clients + manual event bridging | `server-compat.ts:86-92`, `server-sdk.tsx:28-56` | API drift, type mismatches |
| R-09 | High | UI | Vendored client tgz v1.17.13 | `packages/app/package.json:57` | App diverges from contract |
| R-10 | High | Build | SDK/migration freshness gates missing | `test.yml`, `database-migration.test.ts:116` | Stale generated artifacts merge |
| R-11 | High | Testing | `server` untested | `packages/server/**` | Regressions in auth/fs/session routes |
| R-12 | Medium | Concurrency | Session move doesn't interrupt execution | `move-session.ts:77-138` | Stale location during move |
| R-13 | Medium | Core | `Effect.die` control flow for compaction | `runner/llm.ts:223,376-388` | Debuggability, error handling |
| R-14 | Medium | UI | TUI imports core domain | `tui/src/app.tsx:5-7` | Layering erosion, bundle size |
| R-15 | Medium | Build | Turbo ordering gaps | `turbo.json` | Flaky/stale builds |
| R-16 | Medium | Security | Location header trust | `server/src/location.ts:29-38` | Filesystem scope escape within auth |
| R-17 | Medium | Supply chain | 20 patches incl. MCP fork | `patches/`, `package.json` | Silent patch breakage on upgrade |
| R-18 | Medium | Concurrency | FiberSet cleanup on retry | `runner/llm.ts:302,378-387` | Leaked tool fibers |
| R-19 | Low | Core | Global memo map never finalized | `effect/memo-map.ts:3` | Memory retention |
| R-20 | Low | Security | npm provenance disabled | `publish.yml:514` | Supply-chain transparency |

## 7. Refactoring Roadmap

Each workstream lists: **Goal**, **Scope/Files**, **Depends on**, **Risk**, **Effort** (S ≤ 2 days, M ≤ 1 week, L > 1 week), **Acceptance criteria**.

### Workstream 0 — Baseline Hygiene (quick wins, no behavior change)

- **Goal:** remove orphaned/release artifacts and wire missing CI gates.
- **Scope:** delete stale release/marketing docs (done in baseline); wire `check:generated` for `packages/sdk/js`; run `migration.ts --check` on all CI platforms; add a CI step that fails if `patches/` no longer apply; fix `turbo.json` `dependsOn` for `typecheck`/`build`.
- **Depends on:** none. **Risk:** Low. **Effort:** S.
- **Acceptance:** CI fails on stale SDK/migration artifacts and on non-applying patches.

### Workstream 1 — Decide and Execute the Session-Stack Convergence

- **Goal:** one session execution path.
- **Scope:** `packages/opencode/src/session/*` (V1) and `packages/core/src/session/**` (V2); server wiring `server.ts:298-303`; `SessionExecution` implementation.
- **Approach (choose one):**
  - **(1a) Finish V2:** move MCP/LSP/permission/plugin integration into the V2 runner, wire `SessionV2.prompt` into handlers, delete V1 loop. Highest long-term value; largest effort.
  - **(1b) Freeze V2:** remove the dormant runner + context-epoch path, keep only the shared event/projector layer. Lower effort; forgoes the cleaner design.
- **Depends on:** Workstream 3 (concurrency guard) if choosing 1a.
- **Risk:** High (core execution). **Effort:** L.
- **Acceptance:** exactly one session execution implementation; one concurrency mechanism; V1 schema no longer written.

### Workstream 2 — Unify the Client/SDK Surface

- **Goal:** one authoritative client generation path.
- **Scope:** `packages/client` (canonical), `packages/sdk/js` (legacy), `packages/sdk-next` (embedded), consumers `app`, `session-ui`, `tui`, `plugin`, `cli`, `slack`.
- **Approach:** make `@opencode-ai/client` canonical; replace the vendored tgz in `app`/`session-ui` with the workspace package; migrate `tui` off `sdk/v2`; decide `sdk-next`'s fate (adopt as embedded host or remove); remove the runtime compat proxy and event-name bridging once consumers are on the new contract; either publish the legacy SDK from the same IR or deprecate it.
- **Depends on:** Workstream 0 (SDK freshness gate). **Risk:** High. **Effort:** L.
- **Acceptance:** app/session-ui/tui use workspace `client`; no runtime protocol-detection proxy; one event vocabulary.

### Workstream 3 — Concurrency & Lifecycle Hardening

- **Goal:** eliminate duplicate execution, scope leaks, and DB serialization bottlenecks.
- **Scope:** `core/session/execution/*`, `core/session/run-coordinator.ts`, `runner/llm.ts`, `sdk-next/src/opencode.ts`, `core/event.ts`, `core/database/sqlite.*`.
- **Actions:** add a real per-session run guard in `SessionExecution`; keep embedded request scopes alive for streamed bodies; make owner `claim` transactional; make `moveSession` interrupt/stop active runs; fix `FiberSet` cleanup on retry; evaluate a small read-connection pool or WAL read path.
- **Depends on:** Workstream 1 decision. **Risk:** Medium-High. **Effort:** M-L.
- **Acceptance:** stress test with concurrent prompts yields no duplicate turns; embedded SSE completes after scope-safe consumption; no leaked fibers.

### Workstream 4 — Module Boundary Hardening

- **Goal:** enforce the documented layering automatically.
- **Scope:** `tui` imports, `session-ui`/`app` `core/util` coupling, `plugin → sdk` chain, `core` monolith.
- **Actions:** add an import-boundary lint/test covering all UI packages (no `core` domain, no `server`); extract `core/util`, `core/flag`, `core/installation` into a lightweight shared package (or make them dependency-free entrypoints); remove `plugin`'s runtime dependency on the legacy SDK.
- **Depends on:** Workstream 2 (for `plugin`/`sdk`). **Risk:** Medium. **Effort:** M.
- **Acceptance:** CI rejects forbidden cross-package imports; UI bundle no longer transitively includes providers/PTY.

### Workstream 5 — Security Hardening

- **Goal:** close the ranked security findings.
- **Scope:** `server/src/auth.ts` (constant-time compare), `core/src/credential/*` (encryption/keychain), `server/src/location.ts` (validate directory against known projects), `server/src/cors.ts`, `core/src/flag/flag.ts` (`OPENCODE_PERMISSION` trust), `publish.yml` (provenance).
- **Depends on:** none. **Risk:** Medium (behavior changes). **Effort:** M.
- **Acceptance:** credentials encrypted at rest; constant-time compare; directory scoping validated; documented threat model.

### Workstream 6 — Test Coverage for the Server & Integration Paths

- **Goal:** cover the untested HTTP surface and end-to-end flows.
- **Scope:** `packages/server` tests for auth, CORS, location/session middleware, fs traversal, PTY connect; an integration test through the in-memory embedded router (`sdk-next` or `createEmbeddedRoutes`).
- **Depends on:** Workstream 2 (embedded host decision). **Risk:** Low-Medium. **Effort:** M.
- **Acceptance:** `packages/server` has meaningful tests; CI runs an end-to-end request test.

### Workstream 7 — Observability & Metrics

- **Goal:** fill observability gaps.
- **Scope:** enable structured server request logging (currently disabled), add metrics export (OTLP metrics or Prometheus), add uptime checks for the health endpoint.
- **Depends on:** none. **Risk:** Low. **Effort:** S-M.

### 7.1 Recommended Sequencing

```
W0 (hygiene) ─▶ W2 (client) ─┬─▶ W4 (boundaries)
                              └─▶ W6 (server tests)
W1 (session decision) ─▶ W3 (concurrency)
W5 (security) ─ independent
W7 (observability) ─ independent
```

Start with **W0** (cheap, unblocks CI), then make the two strategic decisions (**W1**, **W2**) before large refactors, and run **W5** in parallel as independent, high-value work.

## 8. Decision Log / Open Questions

These require an explicit human decision before large refactors:

1. **Session stack:** finish V2 or freeze/remove it? (Blocks W1, W3.)
2. **Client/SDK:** is `@opencode-ai/client` the only public client, or must the published `@opencode-ai/sdk` remain for external plugin compatibility? (Blocks W2, W4.)
3. **Embedded host:** is `@opencode-ai/sdk-next` the future embedding surface? (Blocks W2, W6.)
4. **Plugin API:** when is v1 deprecated in favor of v2? (Blocks W4.)
5. **UI component trees:** is `v2/` replacing `components/`? (Standalone.)
6. **Native LLM runtime:** graduate `OPENCODE_EXPERIMENTAL_NATIVE_LLM`, or keep AI SDK as the only path? (Blocks LLM consolidation.)
7. **Credentials at rest:** OS keychain vs SQLite encryption? (Blocks W5.)
8. **`core` split:** extract a lightweight `core-shared`? (Blocks W4.)
9. **Observability stack:** OTLP metrics vs Prometheus? (Blocks W7.)

## 9. Appendix

### 9.1 Reviewer Round Index

| Domain | Round 1 (breadth) | Round 2 (deep dive) | Round 3 (cross-cutting) | Round 4 (synthesis) |
|--------|-------------------|---------------------|--------------------------|---------------------|
| A — Core Runtime | package layout, session/tool/context/event/plugin/PTY map | prompt lifecycle, steer/queue, context epochs, compaction, V1/V2, interruption | dependency layering, duplication, concurrency/scopes | doc-ready section |
| B — Contract/Server/SDK | schema→protocol→server, 18 groups, codegen, SDKs | request lifecycle, codegen IR, embedded host, SDK vs sdk-next, events | layering audit, duplication/type flow | doc-ready section |
| C — LLM/Providers | llm routes/protocols/providers, codemode, plugins | provider turn, options merge, tool runtime, adapter, codemode, plugin lifecycle | duplication, concurrency | doc-ready section |
| D — UI | tui/app/desktop/ui/session-ui/web/console | app state flow, tui prompt flow, plugin slots, desktop sidecar, markdown | dependency/duplication, build | doc-ready section |
| E — Infra/Tooling | db, migrations, build, deploy, tests, security | db bootstrap, event store, schema inventory, deploy topology, CI/CD, test infra | layering, duplication, build/codegen, testing/security/observability | doc-ready section |

### 9.2 Key Evidence Anchors

- V2 dormant: `packages/core/src/session.ts:360`, `packages/server/src/handlers/session.ts:300`, `packages/core/test/session-prompt.test.ts:101`
- Shared bridge: `packages/core/src/event.ts:150`, `packages/core/src/session/projector.ts:210-453`
- Client boundary test: `packages/client/test/import-boundaries.test.ts`, `packages/client/test/contract-identity.test.ts`
- Codegen: `packages/client/script/build.ts`, `packages/httpapi-codegen/src/index.ts:76-267`, `.github/workflows/test.yml:72-75`
- Concurrency: `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/runner/llm.ts:390-413`
- DB: `packages/core/src/database/database.ts:27-32`, `packages/core/src/database/sqlite.node.ts:115`
- Migrations: `packages/core/src/database/migration.ts:18-107`, `packages/core/script/migration.ts:64-92`
- Security: `packages/core/src/credential/sql.ts:9`, `packages/server/src/auth.ts:48`, `packages/server/src/location.ts:29-38`
- UI dual client: `packages/app/src/utils/server-compat.ts:86-92`, `packages/app/package.json:57`

### 9.3 Commands

```bash
bun typecheck                                   # all packages (turbo)
bun lint                                        # oxlint (type-aware)
cd packages/core && bun test --only-failures    # tests only from package dirs
bun run generate                                # from packages/client
cd packages/core && bun script/migration.ts --check
```
