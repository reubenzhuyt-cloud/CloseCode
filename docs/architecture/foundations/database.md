# Database (`@opencode/core/database`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the Drizzle schema, generated migrations, and the per-platform SQLite driver selection for Core. Does not own domain logic — it persists tables that Core services read and write.

## Key Paths
- `packages/core/src/database/database.ts` — `Database` service and layer
- `packages/core/src/database/schema.gen.ts`, `schema.sql.ts` — generated Drizzle tables
- `packages/core/src/database/migration.gen.ts`, `migration.ts` — migrations (64 numbered migrations at the stamp commit; `automation`, `machine`, `machine-key` are the newest)
- `packages/core/src/database/batch.ts`, `drizzle.ts` — batched writes and Drizzle wiring
- `packages/core/src/database/sqlite.{bun,node,workerd}.ts` — platform drivers selected via the `#sqlite` import condition
- `packages/core/src/database/storage-failure.ts` — `StorageFailure`, surfaced verbatim by the server's defect middleware
- `packages/core/src/database/v1-migration.{bun,noop}.ts` — v1→v2 data migration (no-op on non-Bun)
- `packages/core/src/database/path.ts` — database file paths
- `packages/effect-drizzle-sqlite/` — Drizzle↔Effect SQLite integration (examples only; sourced from effect-smol)

## Public API / Key Types
- `Database` service + `node` used by location/session/event SQL modules
- Drizzle table objects (`SessionMessageTable`, `AutomationTable`, `MachineTable`, …) referenced by `core/src/**/sql.ts`
- `bun run --cwd packages/core migration` regenerates migrations; `db` runs drizzle-kit

## Notes
- Never use SQL newer than SQLite 3.39.4 (macOS 13.0 loads the system SQLite); see `packages/core/AGENTS.md` for the version table and the `->`/`->>`/`unixepoch()` restrictions.

## Dependencies
- In: `effect`, `drizzle-orm`, platform `#sqlite` conditions.
- Out: every Core service with durable state; indirectly Server.

## Links
- Parent: INDEX.md
