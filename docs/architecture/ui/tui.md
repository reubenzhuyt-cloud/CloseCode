# TUI (`@opencode/tui`)

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
The terminal UI built on OpenTUI/Solid: app shell, routes, components, prompt/editor, feature plugins, and the storybook harness. Owns rendering and client-local state; it talks to the server only through `@opencode/client`.

## Key Paths
- `packages/tui/src/index.tsx` — `run`, `TuiInput`, `LogProvider`
- `packages/tui/src/app.tsx`, `runtime.tsx` — app shell/runtime
- `packages/tui/src/component/` — dialogs, command palette, panes (e.g. `dialog-model.tsx`, `dialog-mcp.tsx`, `dialog-session-list.tsx`)
- `packages/tui/src/routes/` — `home.tsx`
- `packages/tui/src/feature-plugins/` — `home/`, `prompt/`, `sidebar/`, `system/` (diff viewer, notifications, stats, plugins) and `system/storybook/` (storybook stories; registered in `index.tsx`)
- `packages/tui/src/plugin/` — TUI plugin host (`api.tsx`, `builtins.ts`, `discovery.ts`, `markdown.ts`, `render.tsx`, `source.ts`, `watch.ts`)
- `packages/tui/src/context/`, `prompt/`, `theme/`, `ui/`, `devtools/`, `mini/`, `simulation/`
- `packages/tui/src/editor.ts`, `editor-zed*.ts`, `clipboard.ts`, `attention.ts`, `attention-sounds.*.ts`, `parsers-config.ts`
- `packages/tui/src/util/renderer.ts` (`setTerminalTitle`), `util/presentation.ts` (`epilogue({ session?, updatedVersion? })` closing screen)

## Public API / Key Types
- `run`, `TuiInput`, `LogProvider`/`useLog`; `@opencode/tui/mini` frontend input
- Storybook: run with `OPENCODE_STORY=<story-id> bun run dev:live` (AGENTS.md)

## Notes
- Depends on `@opencode/core` for simulation/dev tooling (e.g. `simulation`), plus `latex`/`merman` for rendering.

## Dependencies
- In: `client`, `core`, `plugin`, `schema`, `simulation`, `theme`, `ui`, `util`, `latex`, `merman`.
- Out: `cli` (hosts it).

## Links
- Parent: INDEX.md
