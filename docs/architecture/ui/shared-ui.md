# Shared UI (`@opencode/ui`, `@opencode/session-ui`, `@opencode/theme`, storybook)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
The reusable UI layer consumed by `app`, `tui`, and `desktop`: a headless-ish component kit, session-specific rendering (messages, markdown, diffs, files), theme tokens, and the storybook harness. Owns presentation only — no server access.

## Key Paths
- `packages/ui/src/` — component kit: `components/`, `forms/`, `overlays/`, `navigation/`, `data-display/`, `feedback/`, `layout/`, `typography/`, `icons/`, `hooks/`, `motion/`, `i18n/`, `theme/`, `styles/`, `storybook/`; per-component exports in `package.json`
- `packages/session-ui/src/` — session rendering: `message/` (incl. quote parts), `timeline/`, `timeline-next/` (projection, placement, spacing rules, compaction/error rows, nested rails), `tools/`, `pierre/` (diffs, comment-selection machine), `components/` (diagram preview, file media), `sources/`, `v2/`, `storybook/`, markdown pipeline (`markdown-*.tsx`)
- `packages/session-ui/src/import-boundaries.test.ts` — enforces UI import boundaries
- `packages/theme/src/tui/` — TUI theme tokens (`@opencode/theme/tui`, `/tui/v1`)
- `packages/storybook/` — app-level storybook (`.storybook/`, `playwright/`); `packages/stories/` runs component tests against stories
- `packages/ui/AGENTS`-style conventions: theme tokens chosen by semantic role (AGENTS.md "TUI Theme Tokens")

## Public API / Key Types
- `@opencode/ui` component exports (button, dialog, tabs, select, text-input, icons, tokens, storybook scaffold/fixtures)
- `@opencode/session-ui` message/timeline/tool components, `timeline-next` projection
- `@opencode/theme` TUI token surfaces

## Dependencies
- In: `schema` (via consumers), `util` (session-ui); `ui` has no `@opencode/*` runtime deps.
- Out: `app`, `session-ui`→`ui`, `tui`, `storybook`, `stories`.

## Links
- Parent: INDEX.md
