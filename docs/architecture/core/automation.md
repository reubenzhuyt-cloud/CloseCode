# Core / Automations

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns scheduled and event-driven work: automations that run a prompt, a shell command, or a Code Mode action on an at/every/cron trigger or on an MCP-server push event. Owns the durable `automation` table, due-time advance, the scheduler lease, and run sessions. Does not own the session loop (session/) nor MCP transport (`mcp/`).

## Key Paths
- `packages/core/src/automation.ts` — `Automation.Service` (process-global), `Interface` (`create`, `list`, `get`, `pause`, `resume`, `remove`, `enabled`, `tick`, `run`), errors `NotFoundError`/`InvalidError`/`DisabledError`; SQLite lease elects one scheduler per database
- `packages/core/src/automation/` — `author.ts` (authoring prompts), `code.ts` (Code Mode action), `shell.ts` (shell action), `event.ts` (MCP event trigger: `check`, `follow`, `prompt`, `input`), `sql.ts` (`AutomationTable`)
- `packages/core/src/tool/plugin/automation.ts` — model-facing `automation` namespace (`create`, `list`, `pause`, `resume`, `delete`, `get`), all `codemode: true`
- `packages/schema/src/automation.ts` — `ID` (`aut_`), `Trigger` (`at` | `every` | `cron` | `event`), `Action` (`prompt` | `code` | `shell`), `Target`, `Status` (`active`/`paused`/`done`), `Outcome` (`fired`/`late`/`skipped`/`disabled`/`failed`/`expired`), `runSessionID`/`isRunSession`
- `packages/server/src/handlers/automation.ts` — `automation.*` endpoints (create/list/get/pause/resume/remove) in `server.experimental`
- `packages/schema/src/config.ts` — `automations` config switch (default true)

## Public API / Key Types
- `Automation.Service`, `Automation.Interface`, `Automation.runSessionID(id, run)` — each run gets its own `ses_aut_*` session
- `Automation.CreateInput`, `Automation.Info`, `Automation.ListInput` (session/project/directory filters)
- `Automation.node` (`makeGlobalNode`, `:1270`) — started by Server in `applicationServiceNodes`

## Behavior Notes
- Automations are disabled per directory by config, and `DisabledError` reports it; HTTP create settles permission asks unattended (`Permission.Unattended = []`) because a stateless caller has no UI listener.
- Event triggers follow `McpEvent.ExperimentalEvent`; a trigger only fires when the server is connected and offers the event type with the given arguments (`automation/event.ts`).

## Dependencies
- In: `Bus`, `Database`, `Session`, `Permission`, `Mcp`, `Config`, `FSUtil`, `Flag`.
- Out: server (`automation` routes), TUI/app via client, plugin command (`plugin/command/automation.txt`).

## Links
- Parent: INDEX.md
