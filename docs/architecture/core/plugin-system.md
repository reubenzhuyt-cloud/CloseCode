# Core / Plugin System

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns the in-process plugin host: discovering/loading plugin sources, exposing hooks, and the built-in plugin modules that extend Core services. Does not own the plugin authoring SDK package (`@opencode/plugin`, see platform/plugin-packages.md) nor individual plugin implementations.

## Key Paths
- `packages/core/src/plugin.ts` — `Plugin` service re-export (`Service`, `awaitActivation`, `Generation`, `Interface`), `node`
- `packages/core/src/plugin/` — host/module internals: `service.ts`, `host.ts`, `module.ts`, `instance.ts`, `identity.ts`, `hooks.ts`, `internal.ts`, `promise.ts`, `sdk.ts`, `supervisor.ts`, `source-directory.ts`, `update.ts`, `warming.ts`, `tool-input-repair.ts`
- Built-in plugin behaviors: `agent.ts`, `command.ts`, `provider.ts`, `models-dev.ts`, `mcp-codemode-defaults.ts`, `compaction.ts` (native compaction registration), `plan.ts`, `optimize.ts`, `skill.ts`
- Built-in plugin subdirs: `plugin/{command,provider,skill,system-prompt,vcs,websearch}/`
- `packages/schema/src/plugin.ts`, `packages/schema/src/config/plugin.ts` — plugin contracts and config

## Public API / Key Types
- `Plugin.Service` (`@opencode/Plugin`), `Plugin.awaitActivation`, `Plugin.Generation`, `Plugin.Interface`
- Plugin state transforms via `State.Transformable` (e.g. `SessionCompaction` editor registration)

## Notes
- Plugins load asynchronously: handlers answer with what is loaded now and never block on activation, except the temporary `awaitPlugins` gate exported by `packages/server/src/location.ts:39`, used only by the `model`, `provider`, `generate`, `voice`, `websearch`, and `skill` handlers (policy/diagnostic waits — AGENTS.md "Plugin Loading").
- Native compaction strategies are registered through the `SessionCompaction` editor by plugins; later registrations win (AGENTS.md "V2 Session Core").
- The plugin `skill` context (`host.ts:492`) forwards `SkillEditor.add(skill, registration?)` into the Skill registry; omitted registration defaults to `source: "plugin"`.

## Dependencies
- In: `schema/plugin`, `@opencode/plugin`, State/Tool/Config services.
- Out: session, tools, server (plugin routes).

## Links
- Parent: INDEX.md
