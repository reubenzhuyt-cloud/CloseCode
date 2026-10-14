# Database (`@opencode/core/database`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns the Drizzle schema, generated migrations, and the per-platform SQLite driver selection for Core. Does not own domain logic — it persists tables that Core services read and write.

## Key Paths
- `packages/core/src/database/database.ts` — `Database` service and layer
- `packages/core/src/database/schema.gen.ts`, `schema.sql.ts` — generated Drizzle tables
- `packages/core/src/database/migration.gen.ts`, `migration.ts` — migrations
- `packages/core/src/database/sqlite.{bun,node,workerd}.ts` — platform drivers selected via the `#sqlite` import condition
- `packages/core/src/database/v1-migration.{bun,noop}.ts` — v1→v2 data migration (no-op on non-Bun)
- `packages/core/src/database/path.ts` — database file paths
- `packages/effect-drizzle-sqlite/` — Drizzle↔Effect SQLite integration (examples only; sourced from effect-smol)

## Public API / Key Types
- `Database` service + `node` used by location/session/event SQL modules
- Drizzle table objects (`SessionMessageTable`, etc.) referenced by `core/src/**/sql.ts`
- `bun run --cwd packages/core migration` regenerates migrations; `db` runs drizzle-kit

## Dependencies
- In: `effect`, `drizzle-orm`, platform `#sqlite` conditions.
- Out: every Core service with durable state; indirectly Server.

## Links
- Parent: INDEX.md
