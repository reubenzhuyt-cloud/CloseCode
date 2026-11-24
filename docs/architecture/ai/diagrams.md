# Diagrams & Math (`@opencode/latex`, `@opencode/merman`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Text-to-render plugins used by the UI to display math and diagrams: LaTeX math parsing/rendering and Mermaid-style diagram layout. Own no domain logic; they expose markdown/plugin entry points consumed by `tui` and `session-ui`.

## Key Paths
### LaTeX (`@opencode/latex`)
- `packages/latex/src/parser.ts`, `render.ts`, `layout.ts`, `symbols.ts`, `limits.ts`, `types.ts`
- `packages/latex/src/markdown.ts`, `plugin.ts` — markdown integration (`exports: ./markdown`, `./plugin`)

### Merman (`@opencode/merman`)
- `packages/merman/src/detect.ts`, `diagnostics.ts`, `markdown.ts`, `palette.ts`, `plugin.ts`
- Diagram families: `core/`, `flowchart/`, `sequence/`, `gantt/`, `gitgraph/`, `state/`, `timeline/`
- `packages/merman/src/layout-audit.test.ts`, `palette.test.ts`

## Public API / Key Types
- `@opencode/latex/markdown`, `@opencode/latex/plugin`; `@opencode/merman/markdown`, `@opencode/merman/palette`, `@opencode/merman/plugin`

## Dependencies
- In: `util`, rendering libs.
- Out: `tui` (both), `session-ui` (`markdown-mermaid.ts`).

## Links
- Parent: INDEX.md
