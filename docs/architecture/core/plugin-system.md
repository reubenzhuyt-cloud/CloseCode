# Core / Plugin System

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the in-process plugin host: discovering/loading plugin sources, exposing hooks, and the built-in plugin modules that extend Core services. Does not own the plugin authoring SDK package (`@opencode/plugin`, see platform/plugin-packages.md) nor individual plugin implementations.

## Key Paths
- `packages/core/src/plugin.ts` — `Plugin` service re-export (`Service`, `awaitActivation`, `Generation`, `Interface`), `node`
- `packages/core/src/plugin/` — host/module internals: `service.ts`, `host.ts`, `module.ts`, `instance.ts`, `identity.ts`, `hooks.ts`, `internal.ts`, `promise.ts`, `sdk.ts`, `supervisor.ts`, `source-directory.ts`, `update.ts`, `warming.ts`, `tool-input-repair.ts`
- Built-in plugin behaviors: `agent.ts`, `command.ts`, `provider.ts`, `models-dev.ts`, `mcp-codemode-defaults.ts`, `compaction.ts` (native compaction registration), `plan.ts`, `optimize.ts`, `skill.ts`, `verbosity.ts`, `goal.ts`, `fork-notice.ts` (fork-continuation notice), `home-memory.ts`
- Built-in plugin subdirs: `plugin/{command,goal,provider,skill,system-prompt,vcs,websearch}/`
- `packages/core/src/plugin/skill/` — embedded skills (`opencode.md`, `opencode-api.md`, `report.md`) plus `opencode/api.ts` (generated API reference, `bun run generate:api-skill` from `packages/core`)
- `packages/schema/src/plugin.ts`, `packages/schema/src/config/plugin.ts` — plugin contracts and config

## Public API / Key Types
- `Plugin.Service` (`@opencode/Plugin`), `Plugin.awaitActivation`, `Plugin.Generation`, `Plugin.Interface`
- Plugin state transforms via `State.Transformable` (e.g. `SessionCompaction` editor registration)
- `PluginInternal.guarded` (`internal.ts:341`) — plugin IDs that config cannot remove (`opencode`, config-policy)

## Notes
- Plugins load asynchronously. Server handlers answer with what is loaded now: they never wait for activation, never retry until something appears, and never turn slow plugins into a timeout or 503 — reads and actions alike (AGENTS.md "Plugin Loading"). Long-lived clients refresh on the matching `*.updated` event; one-shot clients wait on their side. There is no server-side `awaitPlugins` gate.
- Inside Core's own pipeline, `Plugin.awaitActivation` is still awaited where plugin-registered state must exist before work proceeds: prompt preparation (`session/prompt.ts:40`), the runner's LLM steps (`session/runner/llm.ts:82,137,234`), session command/generate/skill admission, and automation run/shell/code execution. Scheduling the work is what must not wait.
- Order matters inside `plugin/internal.ts`: `ConfigAutoApprovePlugin` (`:335`) registers before `ConfigPolicyPlugin` (`:336`) so policy `deny` wins over an auto-approve `ask`→`allow` rewrite.
- Native compaction strategies are registered through the `SessionCompaction` editor by plugins; later registrations win (AGENTS.md "Session Core").
- The plugin `skill` context (`host.ts:494`) forwards `SkillEditor.add(skill, registration?)` into the Skill registry; omitted registration defaults to `source: "plugin"`.

## Dependencies
- In: `schema/plugin`, `@opencode/plugin`, State/Tool/Config services.
- Out: session, tools, server (plugin routes).

## Links
- Parent: INDEX.md
