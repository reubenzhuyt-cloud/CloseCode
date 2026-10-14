# Shared UI (`@opencode/ui`, `@opencode/session-ui`, `@opencode/theme`, storybook)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
The reusable UI layer consumed by `app`, `tui`, and `desktop`: a headless-ish component kit, session-specific rendering (messages, markdown, diffs, files), theme tokens, and the storybook harness. Owns presentation only — no server access.

## Key Paths
- `packages/ui/src/` — component kit: `components/`, `forms/`, `overlays/`, `navigation/`, `data-display/`, `feedback/`, `layout/`, `typography/`, `icons/`, `hooks/`, `i18n/`, `theme/`, `styles/`, `storybook/`; per-component exports in `package.json`
- `packages/session-ui/src/` — session rendering: `message/`, `timeline/`, `tools/`, `pierre/` (diffs), `v2/`, `storybook/`, markdown pipeline (`markdown-*.tsx`), `line-comment*`, `dock-prompt.tsx`
- `packages/session-ui/src/import-boundaries.test.ts` — enforces UI import boundaries
- `packages/theme/src/tui/` — TUI theme tokens (`@opencode/theme/tui`, `/tui/v1`)
- `packages/storybook/` — app-level storybook (`.storybook/`, `playwright/`)
- `packages/ui/AGENTS`-style conventions: theme tokens chosen by semantic role (AGENTS.md "TUI Theme Tokens")

## Public API / Key Types
- `@opencode/ui` component exports (button, dialog, tabs, select, text-input, icons, tokens, storybook scaffold/fixtures)
- `@opencode/session-ui` message/timeline/tool components
- `@opencode/theme` TUI token surfaces

## Dependencies
- In: `schema` (via consumers), `util` (session-ui); `ui` has no `@opencode/*` runtime deps.
- Out: `app`, `session-ui`→`ui`, `tui`, `storybook`.

## Links
- Parent: INDEX.md
