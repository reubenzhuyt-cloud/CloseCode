# Agent Toolset Context + TUI `/agents` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each agent declare a `toolset` visibility allowlist so only chosen built-in/MCP tools enter the model context, and add a TUI `/agents` dialog to create/edit/delete agents.

**Architecture:** Add an optional `toolset: Record<string, boolean>` to agent config and `Agent.Info`. A pure `toolsetAllows(toolset, candidates)` helper (glob, last-match-wins, default hidden) drives filtering at two runtime points: `ToolRegistry.tools()` for built-in tools and `SessionTools.resolve()` for MCP tools. The TUI gains a management dialog that reads the raw config `agent` block and persists via the existing legacy `config.update` / `global.config.update` endpoints.

**Tech Stack:** Bun, TypeScript, Effect Schema, SolidJS + OpenTUI (TUI), `@opencode-ai/sdk/v2`, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-09-12-agent-toolset-context-design.md`

## Global Constraints

- Follow `packages/opencode/AGENTS.md`: use `export * as Foo from "./foo"` module shape; no `export namespace`; `Effect.gen` + `Effect.fn`.
- Follow repo style: no comments unless non-obvious; no `any`; `const` over `let`; early returns; avoid `else`.
- Tests run only from package directories (`packages/opencode`, `packages/core`, ...). Never from repo root.
- Typecheck with `bun typecheck` from the package directory; never `tsc` directly.
- Commit only after the task's tests and typecheck pass. Do NOT run git commit from a subagent unless the coordinator explicitly asks.
- `toolset` semantics (verbatim): absent or empty → all tools visible; present and non-empty → allowlist, evaluated in object key order, last matching pattern wins, default hidden.

---

### Task 1: Add `toolset` to agent config schema and types

**Files:**
- Modify: `packages/core/src/v1/config/agent.ts`
- Modify: `packages/opencode/src/config/v2-compat.ts` (Agent struct ~`:63`, `lowerAgent` ~`:396`)
- Modify: `packages/opencode/src/agent/agent.ts` (`Info` ~`:35`, merge loop ~`:267`)
- Test: `packages/opencode/test/config/agent-toolset.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Agent.Info.toolset?: Record<string, boolean>` (opencode `agent.ts`), and config parsing that preserves `toolset` through both the V1 `agent` key and the V2 `agents` key.

- [ ] **Step 1: Write the failing test**

Create `packages/opencode/test/config/agent-toolset.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"

describe("agent toolset config", () => {
  test("preserves toolset through the V1 agent schema", () => {
    const parsed = Schema.decodeUnknownSync(ConfigAgentV1.Info)({
      description: "d",
      toolset: { "*": false, read: true, "github_*": true },
    })
    expect(parsed.toolset).toEqual({ "*": false, read: true, "github_*": true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/config/agent-toolset.test.ts` (from `packages/opencode`)
Expected: FAIL — `parsed.toolset` is `undefined`.

- [ ] **Step 3: Add `toolset` to the V1 agent schema**

In `packages/core/src/v1/config/agent.ts`, add to the `Schema.Struct({...})` inside `AgentSchema` (after the `tools` field at ~`:21`):

```ts
    toolset: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
      description:
        "Visibility allowlist for tools exposed to this agent. Absent = all tools. Present = only matching tools; keys are globs over tool ids or MCP names, plus 'mcp:<server>'.",
    }),
```

Add `"toolset"` to the `KNOWN_KEYS` set (~`:43-60`). No change to `normalize` is needed: `toolset` is a known key so it survives the `...agent` spread.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/config/agent-toolset.test.ts` (from `packages/opencode`)
Expected: PASS.

- [ ] **Step 5: Add `toolset` to the V2-compat agent schema**

In `packages/opencode/src/config/v2-compat.ts`, add to the `Agent` struct (~`:63-78`):

```ts
  toolset: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
```

In `lowerAgent` (~`:396-407`), inside the `for` loop key list add `"toolset"`:

```ts
  for (const key of ["description", "mode", "hidden", "color", "steps", "toolset"] as const) {
    if (input[key] !== undefined) result[key] = input[key]
  }
```

- [ ] **Step 6: Add `toolset` to `Agent.Info` and the config merge**

In `packages/opencode/src/agent/agent.ts`, add to the `Info` `Schema.Struct` (after `permission` ~`:44`):

```ts
  toolset: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
```

In the config merge loop (~`:281-293`), after the `item.steps` assignment add:

```ts
          item.toolset = value.toolset ?? item.toolset
```

- [ ] **Step 7: Typecheck**

Run: `bun typecheck` (from `packages/opencode`) and `bun typecheck` (from `packages/core`)
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/v1/config/agent.ts packages/opencode/src/config/v2-compat.ts packages/opencode/src/agent/agent.ts packages/opencode/test/config/agent-toolset.test.ts
git commit -m "feat(agent): add toolset config field"
```

---

### Task 2: Add the pure `toolsetAllows` helper

**Files:**
- Create: `packages/opencode/src/agent/toolset.ts`
- Test: `packages/opencode/test/agent/toolset.test.ts`

**Interfaces:**
- Consumes: `Wildcard` from `@opencode-ai/core/util/wildcard`.
- Produces: `Toolset = Record<string, boolean>`; `toolsetAllows(toolset: Toolset | undefined, candidates: readonly string[]): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/opencode/test/agent/toolset.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { toolsetAllows } from "../../src/agent/toolset"

describe("toolsetAllows", () => {
  test("absent or empty toolset allows everything", () => {
    expect(toolsetAllows(undefined, ["bash"])).toBe(true)
    expect(toolsetAllows({}, ["bash"])).toBe(true)
  })

  test("allowlist hides unlisted tools", () => {
    expect(toolsetAllows({ read: true, grep: true }, ["read"])).toBe(true)
    expect(toolsetAllows({ read: true, grep: true }, ["bash"])).toBe(false)
  })

  test("star default with explicit allow overrides", () => {
    const toolset = { "*": false, read: true, bash: true }
    expect(toolsetAllows(toolset, ["read"])).toBe(true)
    expect(toolsetAllows(toolset, ["bash"])).toBe(true)
    expect(toolsetAllows(toolset, ["write"])).toBe(false)
  })

  test("star true with explicit deny", () => {
    const toolset = { "*": true, bash: false }
    expect(toolsetAllows(toolset, ["read"])).toBe(true)
    expect(toolsetAllows(toolset, ["bash"])).toBe(false)
  })

  test("glob matches tool names and mcp server prefix", () => {
    const toolset = { "*": false, "github_*": true, "mcp:linear": true }
    expect(toolsetAllows(toolset, ["github_create_issue", "mcp:github"])).toBe(true)
    expect(toolsetAllows(toolset, ["linear_search", "mcp:linear"])).toBe(true)
    expect(toolsetAllows(toolset, ["gitlab_x", "mcp:gitlab"])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/agent/toolset.test.ts` (from `packages/opencode`)
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `packages/opencode/src/agent/toolset.ts`:

```ts
import { Wildcard } from "@opencode-ai/core/util/wildcard"

export type Toolset = Record<string, boolean>

export function toolsetAllows(toolset: Toolset | undefined, candidates: readonly string[]): boolean {
  if (!toolset || Object.keys(toolset).length === 0) return true
  let visible = false
  for (const [pattern, enabled] of Object.entries(toolset)) {
    if (candidates.some((candidate) => Wildcard.match(candidate, pattern))) visible = enabled
  }
  return visible
}

export * as AgentToolset from "./toolset"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/agent/toolset.test.ts` (from `packages/opencode`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/toolset.ts packages/opencode/test/agent/toolset.test.ts
git commit -m "feat(agent): add toolset visibility helper"
```

---

### Task 3: Filter built-in tools by `toolset`

**Files:**
- Modify: `packages/opencode/src/tool/registry.ts:291-308`
- Test: `packages/opencode/test/agent/toolset.test.ts` (append a focused case on the pure helper used with real ids)

**Interfaces:**
- Consumes: `toolsetAllows` from `@/agent/toolset`.
- Produces: `ToolRegistry.tools()` returns only tools allowed by `input.agent.toolset`.

- [ ] **Step 1: Apply the filter**

In `packages/opencode/src/tool/registry.ts`, add the import near the other `@/agent` imports:

```ts
import { toolsetAllows } from "../agent/toolset"
```

In `tools` (`:291-308`), change the `visible` computation so the toolset filter applies after the model-capability filter:

```ts
      const filtered = (yield* all()).filter((tool) => {
        if (!toolsetAllows(input.agent.toolset, [tool.id])) return false
        if (tool.id === WebSearchTool.id) {
          return webSearchEnabled(input.providerID, { exa: flags.enableExa, parallel: flags.enableParallel })
        }

        const usePatch =
          input.modelID.includes("gpt-") && !input.modelID.includes("oss") && !input.modelID.includes("gpt-4")
        if (tool.id === ApplyPatchTool.id) return usePatch
        if (tool.id === EditTool.id || tool.id === WriteTool.id) return !usePatch

        return true
      })
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck` (from `packages/opencode`)
Expected: no errors.

- [ ] **Step 3: Run the tool registry tests**

Run: `bun test test/tool/parameters.test.ts` (from `packages/opencode`)
Expected: PASS (unaffected — the tool `Parameters` schemas do not go through `registry.tools()`).

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/tool/registry.ts
git commit -m "feat(tool): filter built-in tools by agent toolset"
```

---

### Task 4: Filter MCP tools by `toolset`

**Files:**
- Modify: `packages/opencode/src/mcp/index.ts` (`McpTool` interface ~`:157`, `tools()` ~`:666-688`)
- Modify: `packages/opencode/src/session/tools.ts` (MCP resource tools ~`:136-386`, MCP tool loop ~`:390-490`)
- Test: `packages/opencode/test/agent/toolset.test.ts` (append mcp-prefix case)

**Interfaces:**
- Consumes: `toolsetAllows`.
- Produces: `McpTool` gains `readonly server: string`; `SessionTools.resolve()` returns only MCP tools allowed by `input.agent.toolset`, matching candidates `[toolKey, "mcp:<server>"]`.

- [ ] **Step 1: Add `server` to `McpTool` and populate it**

In `packages/opencode/src/mcp/index.ts`, extend the interface (~`:157-162`):

```ts
export interface McpTool {
  readonly def: MCPToolDef
  readonly client: MCPClient
  readonly timeout?: number
  readonly server: string
}
```

In `tools()` (~`:666-688`), set `server` when building the record:

```ts
        for (const def of listed) {
          result[McpCatalog.toolName(clientName, def.name)] = { def, client, timeout, server: clientName }
        }
```

- [ ] **Step 2: Filter MCP tools in `SessionTools.resolve()`**

In `packages/opencode/src/session/tools.ts`, add the import:

```ts
import { toolsetAllows } from "@/agent/toolset"
```

Change the MCP tool loop (~`:390`) to skip disallowed tools:

```ts
  for (const [key, entry] of Object.entries(yield* mcp.tools())) {
    if (!toolsetAllows(input.agent.toolset, [key, `mcp:${entry.server}`])) continue
    const item = McpCatalog.convertTool(entry.def, entry.client, entry.timeout)
    // ...unchanged
```

- [ ] **Step 3: Filter MCP resource tools**

In `packages/opencode/src/session/tools.ts`, inside the `if (hasMcpResourceServer) {` block (~`:139`), guard each of the three resource tools. Add a helper near the top of `resolve` after `hasMcpResourceServer` is computed:

```ts
  const resourceServers = Object.entries(yield* mcp.clients())
    .filter((entry) => !!entry[1].getServerCapabilities()?.resources)
    .map((entry) => entry[0])
  const resourceCandidates = (toolID: string) => [toolID, ...resourceServers.map((server) => `mcp:${server}`)]
```

Wrap each resource tool assignment with the guard, e.g. for the list tool (~`:140`):

```ts
    if (toolsetAllows(input.agent.toolset, resourceCandidates(MCP_RESOURCE_TOOLS.list))) {
      tools[MCP_RESOURCE_TOOLS.list] = tool({
        // ...unchanged body
      })
    }
```

Apply the same `if (toolsetAllows(...)) { ... }` wrapping to `MCP_RESOURCE_TOOLS.listTemplates` and `MCP_RESOURCE_TOOLS.read`.

- [ ] **Step 4: Typecheck**

Run: `bun typecheck` (from `packages/opencode`)
Expected: no errors.

- [ ] **Step 5: Run the mcp-related tests**

Run: `bun test test/agent/toolset.test.ts` (from `packages/opencode`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/opencode/src/mcp/index.ts packages/opencode/src/session/tools.ts
git commit -m "feat(session): filter MCP tools by agent toolset"
```

---

### Task 5: TUI `/agents` management dialog (list, create, delete)

**Files:**
- Create: `packages/tui/src/component/dialog-agent-manage.tsx`
- Modify: `packages/tui/src/app.tsx:678-685`

**Interfaces:**
- Consumes: `useSDK().client.config.update`, `useSDK().client.global.config.update`, `useSync().data.agent`, `useSync().set`, `useDialog()`, `DialogSelect`, `DialogPrompt.show`, `DialogConfirm`.
- Produces: `DialogAgentManage` component; `/agents` opens it.

- [ ] **Step 1: Create the management dialog**

Create `packages/tui/src/component/dialog-agent-manage.tsx`:

```tsx
import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogAgentEdit } from "./dialog-agent-edit"

const CREATE = "\u0000create"

async function refreshAgents(sdk: ReturnType<typeof useSDK>, sync: ReturnType<typeof useSync>) {
  const result = await sdk.client.app.agents({}, { throwOnError: true })
  sync.set("agent", result.data ?? [])
}

export function DialogAgentManage() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: CREATE, title: "+ Create new agent" },
    ...local.agent.list().map((agent) => ({
      value: agent.name,
      title: agent.name,
      description: `${agent.mode}${agent.model ? ` · ${agent.model.providerID}/${agent.model.modelID}` : ""}`,
    })),
  ])

  async function remove(name: string) {
    await sdk.client.config.update({ config: { agent: { [name]: { disable: true } } } as any })
    await refreshAgents(sdk, sync)
    dialog.clear()
  }

  return (
    <DialogSelect
      title="Agents"
      options={options()}
      actions={[
        {
          command: "dialog.agent.edit",
          title: "edit",
          onTrigger: (option) => {
            if (option.value === CREATE) return
            dialog.replace(() => <DialogAgentEdit name={option.value} />)
          },
        },
        {
          command: "dialog.agent.switch",
          title: "switch",
          onTrigger: (option) => {
            if (option.value === CREATE) return
            local.agent.set(option.value)
            dialog.clear()
          },
        },
        {
          command: "dialog.agent.delete",
          title: "delete",
          onTrigger: async (option) => {
            if (option.value === CREATE) return
            const confirmed = await DialogConfirm.show(
              dialog,
              "Delete agent",
              `Delete agent ${option.value}? This writes disable: true to config.`,
            )
            if (confirmed) await remove(option.value)
          },
        },
      ]}
      onSelect={(option) => {
        if (option.value === CREATE) {
          void DialogPrompt.show(dialog, "Agent name", {
            placeholder: "e.g. researcher",
          }).then((name) => {
            if (!name) return
            dialog.replace(() => <DialogAgentEdit name={name} create />)
          })
          return
        }
        dialog.replace(() => <DialogAgentEdit name={option.value} />)
      }}
    />
  )
}
```

> Note: `DialogConfirm.show` and `DialogPrompt.show` signatures must match the existing helpers; verify against `packages/tui/src/ui/dialog-confirm.tsx` and `dialog-prompt.tsx:118` before finalizing. Adjust the `as any` cast only if the generated `Config3` type rejects `toolset`; prefer regenerating the SDK (see Task 7) over casting.

- [ ] **Step 2: Wire `/agents` to the management dialog**

In `packages/tui/src/app.tsx`, import the component next to `DialogAgent`:

```tsx
import { DialogAgentManage } from "./component/dialog-agent-manage"
```

Change the `agent.list` command `run` (~`:683`):

```tsx
        run: () => {
          dialog.replace(() => <DialogAgentManage />)
        },
```

- [ ] **Step 3: Typecheck**

Run: `bun typecheck` (from `packages/tui`)
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `bun dev` (or the TUI) from `packages/opencode`, open `/agents`, confirm the list shows `+ Create new agent` and existing agents, and that `delete` removes an agent from the list after refresh.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/component/dialog-agent-manage.tsx packages/tui/src/app.tsx
git commit -m "feat(tui): add /agents management dialog"
```

---

### Task 6: TUI agent edit panel (toolset, model, permissions, scope)

**Files:**
- Create: `packages/tui/src/component/dialog-agent-edit.tsx`

**Interfaces:**
- Consumes: `useSDK().client.experimental.tool.ids`, `useSync().data.config` (raw `agent` block), `useSync().data.mcp`, `DialogSelect`, `DialogPrompt`, `DialogModel` (existing component for model selection).
- Produces: `DialogAgentEdit` component that writes `{ agent: { [name]: patch } }` to project or global config.

- [ ] **Step 1: Create the edit panel**

The dialog is a single-element stack: `dialog.replace` fully swaps the top, so any multi-step editor must keep state in **one** component and switch views locally (via a `view` signal), passing callbacks to child views. Do NOT use `dialog.replace` between steps.

Create `packages/tui/src/component/dialog-agent-edit.tsx`:

```tsx
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"

type AgentMode = "all" | "primary" | "subagent"
type Patch = {
  description?: string
  mode?: AgentMode
  model?: string
  toolset?: Record<string, boolean>
  permission?: Record<string, string>
}

export function DialogAgentEdit(props: { name: string; create?: boolean }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const [patch, setPatch] = createSignal<Patch>({})
  const [scope, setScope] = createSignal<"project" | "global">("project")
  const [view, setView] = createSignal<"fields" | "mode" | "toolset">("fields")
  const [toolIds, setToolIds] = createSignal<string[]>([])

  onMount(async () => {
    const result = await sdk.client.experimental.tool.ids({}, { throwOnError: true }).catch(() => undefined)
    setToolIds(result?.data ?? [])
  })

  const stored = createMemo(() => {
    const agents = (sync.data.config as { agent?: Record<string, unknown> }).agent ?? {}
    return (agents[props.name] ?? {}) as Patch
  })

  async function save() {
    const payload = { agent: { [props.name]: patch() } }
    if (scope() === "global") {
      await sdk.client.global.config.update({ config: payload as never }, { throwOnError: true })
    } else {
      await sdk.client.config.update({ config: payload as never }, { throwOnError: true })
    }
    const result = await sdk.client.app.agents({}, { throwOnError: true })
    sync.set("agent", result.data ?? [])
    dialog.clear()
  }

  const fields = createMemo<DialogSelectOption<string>[]>(() => [
    { value: "description", title: "Description", description: patch().description ?? stored().description ?? "(unset)" },
    { value: "mode", title: "Mode", description: patch().mode ?? stored().mode ?? "all" },
    {
      value: "toolset",
      title: "Toolset",
      description: patch().toolset ? `${Object.keys(patch().toolset!).length} rule(s)` : "all tools",
    },
    { value: "scope", title: "Save to", description: scope() },
    { value: "save", title: "Save" },
  ])

  return (
    <Show
      when={view() === "fields"}
      fallback={
        <Show
          when={view() === "mode"}
          fallback={
            <DialogAgentToolsetView
              ids={toolIds()}
              servers={Object.keys(sync.data.mcp ?? {})}
              initial={patch().toolset}
              onDone={(toolset) => {
                setPatch({ ...patch(), toolset })
                setView("fields")
              }}
            />
          }
        >
          <DialogAgentModeView
            onPick={(mode) => {
              setPatch({ ...patch(), mode })
              setView("fields")
            }}
          />
        </Show>
      }
    >
      <DialogSelect
        title={`Edit agent: ${props.name}`}
        options={fields()}
        onSelect={async (option) => {
          if (option.value === "save") return void save()
          if (option.value === "scope") return void setScope(scope() === "project" ? "global" : "project")
          if (option.value === "mode") return void setView("mode")
          if (option.value === "toolset") return void setView("toolset")
          if (option.value === "description") {
            const value = await DialogPrompt.show(dialog, "Description", { value: stored().description ?? "" })
            if (value !== null) setPatch({ ...patch(), description: value })
          }
        }}
      />
    </Show>
  )
}

function DialogAgentModeView(props: { onPick: (mode: AgentMode) => void }) {
  return (
    <DialogSelect
      title="Agent mode"
      options={[
        { value: "all", title: "all" },
        { value: "primary", title: "primary" },
        { value: "subagent", title: "subagent" },
      ]}
      onSelect={(option) => props.onPick(option.value as AgentMode)}
    />
  )
}

function DialogAgentToolsetView(props: {
  ids: string[]
  servers: string[]
  initial?: Record<string, boolean>
  onDone: (toolset: Record<string, boolean>) => void
}) {
  const [selected, setSelected] = createSignal<Set<string>>(
    new Set(
      Object.entries(props.initial ?? {})
        .filter(([key, enabled]) => enabled && key !== "*")
        .map(([key]) => key),
    ),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    ...props.ids.map((id) => ({ value: id, title: id, footer: selected().has(id) ? "✓" : "" })),
    ...props.servers.map((server) => {
      const value = `mcp:${server}`
      return { value, title: value, footer: selected().has(value) ? "✓" : "" }
    }),
  ])

  function toggle(value: string) {
    const next = new Set(selected())
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setSelected(next)
  }

  function commit() {
    const toolset: Record<string, boolean> = { "*": false }
    for (const id of selected()) toolset[id] = true
    props.onDone(toolset)
  }

  return (
    <DialogSelect
      title="Toolset (select toggles, save commits)"
      options={options()}
      onSelect={(option) => toggle(option.value)}
      actions={[{ command: "dialog.toolset.save", title: "save", onTrigger: commit }]}
    />
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun typecheck` (from `packages/tui`)
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run the TUI, create an agent with toolset `{ "*": false, read: true, grep: true }`, save, switch to it, and confirm the model only receives `read` and `grep`.

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/component/dialog-agent-edit.tsx
git commit -m "feat(tui): add agent edit panel"
```

---

### Task 7: Regenerate legacy SDK if `config.update` types reject `toolset`

**Files:**
- Modify (generated): `packages/sdk/js/src/v2/gen/**` (only if regeneration is required)

**Interfaces:**
- Consumes: the updated `ConfigAgentV1.Info` schema from Task 1.
- Produces: `Config3` (SDK config payload type) that includes `agent[name].toolset`.

- [ ] **Step 1: Attempt typecheck**

Run: `bun typecheck` (from `packages/tui`)
Expected: if `toolset` is already accepted (because the config payload type is loose), no errors — skip this task. If it errors, continue.

- [ ] **Step 2: Regenerate the legacy SDK**

Run from `packages/opencode`: `bun dev generate`
Then run from `packages/sdk/js`: `bun script/build.ts`

- [ ] **Step 3: Verify and typecheck**

Run: `bun typecheck` (from `packages/tui`) and `bun typecheck` (from `packages/sdk/js`)
Expected: no errors; remove any `as never`/`as any` casts added in Tasks 5-6.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/js/src/v2/gen
git commit -m "chore(sdk): regenerate for agent toolset config"
```

---

## Self-Review

**Spec coverage**
- §4.1 data model → Task 1.
- §4.2 schema changes (V1 agent, v2-compat, `Agent.Info`) → Task 1. (`schema/src/agent.ts` wire type intentionally skipped; TUI reads raw config — matches spec's "optional".)
- §4.3 built-in filtering → Task 3.
- §4.3 MCP tool + MCP resource filtering → Task 4.
- §5.1 command wiring → Task 5.
- §5.2 management dialog + edit panel → Tasks 5, 6.
- §5.3 persistence → Tasks 5, 6.
- §5.4 refresh → Tasks 5, 6 (`app.agents` → `sync.set`).
- §6 unit tests → Tasks 1, 2; manual verification in Tasks 5, 6.
- §7 risk "MCP tool dynamicity" → Task 6 toolset options include `mcp:<server>` from `sync.data.mcp`.

**Placeholder scan**
- No `TBD`/`TODO`/deferred implementation remain. Task 6 uses a single-component view switch (matching the dialog's single-element stack) instead of cross-`replace` state.
- `as any` / `as never` casts in Tasks 5-6 are conditional and resolved by Task 7. Acceptable but should be removed once types are regenerated.

**Type consistency**
- `Toolset` and `toolsetAllows(toolset, candidates)` used consistently in Tasks 2, 3, 4.
- `McpTool.server` defined in Task 4 and consumed in Task 4 only.
- `Agent.Info.toolset` defined in Task 1, consumed in Tasks 3, 4 via `input.agent.toolset`.

## Known Gaps (must be resolved during implementation)

1. Whether the generated `Config3` type accepts `toolset` determines if Task 7 is needed; if it does not, regenerate the legacy SDK rather than keeping casts.
2. Model editing is not included in Task 6 (description/mode/toolset/scope only). If required, follow `dialog-model.tsx` and add a `model` view using the same single-component pattern.
