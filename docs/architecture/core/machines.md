# Core / Machines & Environments

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns remote-machine access: pairing, the iroh/Noise link, framing and rekeying, remote file/process acting, and the `machine:/path` naming that tool paths use. An `Environment` is what a file or process operation runs against — the local one, or a paired machine reached through a link. Does not own session placement (`Location` is still the placement unit; a machine only widens where a session's files and commands resolve).

## Key Paths
- `packages/core/src/machine/machines.ts` — `Machines.Service` (global): `add`, `remove`, `list`, `get`, `home`, `connect`, `invite`, `join`, `identify`; `Info`, `Reach`, pairing errors
- `packages/core/src/machine/identity.ts` — `Identity.Service` (global) holding the home key; `fromSeed`, `verify`, `InvalidKey`
- `packages/core/src/machine/link.ts` — `Link.accept`/`serve`/`dial`/`connect`, `Carrier`, `Closed`/`Refused`
- `packages/core/src/machine/noise.ts` — Noise handshake/transport primitives (`generateKeyPair`, `keyPair`, `handshake`)
- `packages/core/src/machine/frames.ts` — framing (`MAX_MESSAGE = 160 MiB`), codecs, `rekeying`
- `packages/core/src/machine/iroh.ts`, `iroh-binding.ts` — iroh carrier and its binding; `machine/join.ts` — join-string encode/decode (`Reach`)
- `packages/core/src/machine/driver.ts`, `wire.ts` — `Connection`/`Interface` driver, process/wire message unions (`Hello`, `FileCall`, `FromWorker`, `ToWorker`, `Signal`, `ProcessID`, `Instance`)
- `packages/core/src/machine/path.ts`, `instructions.ts` — `machine:/path` parsing/formatting and the machine-list instruction block
- `packages/core/src/machine/sql.ts` — `MachineTable`
- `packages/core/src/environment/` — `environment.ts` (`ID`, `localID`, `Place`, `Interface`, `make`/`local`/`workspace`/`unavailable`), `environments.ts` (resolves an ID to an environment, via `Machines` for remote ids), `path.ts` (typed path parsing), `files.ts`, `local.ts`, `memory.ts`, `exec-defaults.ts`
- `packages/core/src/file-access.ts:137-205` — path resolution across environments, gated on the `machines` flag
- `packages/core/src/tool/plugin/machine.ts` — the `machine` tool namespace
- `packages/server/src/handlers/machine.ts`, `packages/protocol/src/groups/machine.ts` — the HTTP surface and `MACHINE_LINK_PATH`

## Public API / Key Types
- `Machines.Service`, `Identity.Service`, `Environment.Interface`, `Environment.ID`/`localID`/`Place`
- `Machine.Connection`, `Machine.ConnectionInfo`, `Machine.NotSent`/`Unknown`/`ProcessLost`
- Server integration in `handlers/machine.ts`: caps concurrent handshakes (`MAX_HANDSHAKES = 32`), enforces Noise frame bounds (`MIN_FRAME`/`MAX_FRAME`), and pings served links every 30s

## Behavior Notes
- Everything here is behind the `machines` flag (`packages/schema/src/config/flag.ts`); routes answer 403 when it is off.
- The link never accepts the server password: it authenticates with the Noise handshake (see server/middleware-auth.md).

## Dependencies
- In: `Database`, `Global`, `Flag`, `Filesystem`/`FileAccess`, `schema`.
- Out: session cwd/instructions, tools (`machine`), server (`machine` routes + link), CLI (`closecode machine`).

## Links
- Parent: INDEX.md
