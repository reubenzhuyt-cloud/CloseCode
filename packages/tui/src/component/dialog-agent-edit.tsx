import { createEffect, createMemo, createSignal, onCleanup, onMount, Match, Switch } from "solid-js"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useDialog, useDialogBack } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useTuiConfig } from "../config"
import { useBindings } from "../keymap"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"

const PERMISSIONS = [
  "bash",
  "read",
  "edit",
  "glob",
  "grep",
  "webfetch",
  "task",
  "todowrite",
  "websearch",
  "lsp",
  "skill",
] as const

type AgentMode = "all" | "primary" | "subagent"
type Patch = {
  description?: string
  prompt?: string
  mode?: AgentMode
  toolset?: Record<string, boolean>
  permission?: Record<string, "deny">
}

export function DialogAgentEdit(props: { name: string; create?: boolean; onBack?: () => void }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const [patch, setPatch] = createSignal<Patch>({})
  const [scope, setScope] = createSignal<"project" | "global">("project")
  const [view, setView] = createSignal<"fields" | "mode" | "toolset" | "description" | "permission" | "prompt">(
    "fields",
  )
  const [toolIds, setToolIds] = createSignal<string[]>([])
  const [saving, setSaving] = createSignal(false)

  useDialogBack(() => {
    if (view() !== "fields") {
      setView("fields")
      return true
    }
    if (props.onBack) {
      props.onBack()
      return true
    }
    return false
  })

  onMount(async () => {
    const result = await sdk.client.tool.ids({}, { throwOnError: true }).catch(() => undefined)
    setToolIds(result?.data ?? [])
  })

  const stored = createMemo(() => sync.data.config.agent?.[props.name] ?? {})
  const resolved = createMemo(() => sync.data.agent.find((agent) => agent.name === props.name))
  const promptValue = createMemo(() => patch().prompt ?? resolved()?.prompt ?? "")

  const deniedKeys = createMemo(() => {
    const source: unknown = patch().permission ?? stored().permission
    if (!source || typeof source !== "object") return [] as string[]
    const record = source as Record<string, unknown>
    return PERMISSIONS.filter((key) => record[key] === "deny")
  })

  async function save() {
    if (saving()) return
    setSaving(true)
    try {
      const payload = { config: { agent: { [props.name]: patch() } } }
      if (scope() === "global") {
        await sdk.client.global.config.update(payload, { throwOnError: true })
      } else {
        await sdk.client.config.update(payload, { throwOnError: true })
      }
      const result = await sdk.client.app.agents({}, { throwOnError: true })
      sync.set("agent", result.data ?? [])
      dialog.clear()
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  const fields = createMemo<DialogSelectOption<string>[]>(() => {
    const toolset = patch().toolset
    return [
      {
        value: "description",
        title: "Description",
        description: patch().description ?? stored().description ?? "(unset)",
      },
      {
        value: "prompt",
        title: "Prompt",
        description: promptValue().length ? `${promptValue().length} chars` : "(unset)",
      },
      { value: "mode", title: "Mode", description: patch().mode ?? stored().mode ?? "all" },
      {
        value: "toolset",
        title: "Toolset",
        description: toolset ? `${Object.keys(toolset).length} rule(s)` : "all tools",
      },
      {
        value: "permission",
        title: "Permissions",
        description: deniedKeys().length ? `${deniedKeys().length} denied` : "default",
      },
      { value: "scope", title: "Save to", description: scope() },
      { value: "save", title: "Save" },
    ]
  })

  return (
    <Switch>
      <Match when={view() === "fields"}>
        <DialogSelect
          title={`${props.create ? "Create" : "Edit"} agent: ${props.name}`}
          options={fields()}
          onSelect={async (option) => {
            if (option.value === "save") return void save()
            if (option.value === "scope") return void setScope(scope() === "project" ? "global" : "project")
            if (option.value === "mode") return void setView("mode")
            if (option.value === "toolset") return void setView("toolset")
            if (option.value === "permission") return void setView("permission")
            if (option.value === "description") return void setView("description")
            if (option.value === "prompt") return void setView("prompt")
          }}
        />
      </Match>
      <Match when={view() === "mode"}>
        <DialogSelect
          title="Agent mode"
          options={[
            { value: "all", title: "all" },
            { value: "primary", title: "primary" },
            { value: "subagent", title: "subagent" },
          ]}
          onSelect={(option) => {
            setPatch({ ...patch(), mode: option.value as AgentMode })
            setView("fields")
          }}
        />
      </Match>
      <Match when={view() === "toolset"}>
        <DialogAgentToolsetView
          ids={toolIds()}
          servers={Object.keys(sync.data.mcp ?? {})}
          initial={patch().toolset}
          onDone={(toolset) => {
            setPatch({ ...patch(), toolset })
            setView("fields")
          }}
        />
      </Match>
      <Match when={view() === "description"}>
        <DialogPrompt
          title="Description"
          value={patch().description ?? stored().description ?? ""}
          onConfirm={(value) => {
            setPatch({ ...patch(), description: value })
            setView("fields")
          }}
          onCancel={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "prompt"}>
        <DialogAgentPromptView
          name={props.name}
          value={promptValue()}
          onSave={(text) => {
            setPatch({ ...patch(), prompt: text })
            setView("fields")
          }}
          onDiscard={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "permission"}>
        <DialogAgentPermissionView
          initialDenied={deniedKeys()}
          onDone={(permission) => {
            setPatch({ ...patch(), permission })
            setView("fields")
          }}
        />
      </Match>
    </Switch>
  )
}

function DialogAgentPromptView(props: {
  name: string
  value: string
  onSave: (text: string) => void
  onDiscard: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  const [ask, setAsk] = createSignal(false)
  const [draft, setDraft] = createSignal<string>()
  let textarea: TextareaRenderable

  function back() {
    if (ask()) {
      setAsk(false)
      return true
    }
    if (!textarea || textarea.isDestroyed) return false
    const text = textarea.plainText
    if (text !== props.value) {
      setDraft(text)
      setAsk(true)
      return true
    }
    return false
  }

  useDialogBack(back)

  useBindings(() => ({
    target: textareaTarget,
    enabled: textareaTarget() !== undefined && !ask(),
    priority: 1,
    commands: [
      {
        name: "dialog.agent.prompt.newline",
        title: "Insert newline in agent prompt",
        category: "Dialog",
        run() {
          if (!textarea || textarea.isDestroyed) return
          textarea.newLine()
        },
      },
      {
        name: "dialog.agent.prompt.submit",
        title: "Save agent prompt",
        category: "Dialog",
        run() {
          if (!textarea || textarea.isDestroyed) return
          props.onSave(textarea.plainText)
        },
      },
    ],
    bindings: tuiConfig.keybinds.gather("dialog.agent.prompt", [
      "dialog.agent.prompt.submit",
      "dialog.agent.prompt.newline",
    ]),
  }))

  onMount(() => dialog.setSize("xlarge"))
  onCleanup(() => dialog.setSize("medium"))

  createEffect(() => {
    const target = textareaTarget()
    if (!target || target.isDestroyed) return
    setTimeout(() => {
      if (!target || target.isDestroyed) return
      target.focus()
      target.gotoLineEnd()
    }, 1)
  })

  return (
    <Switch>
      <Match when={ask()}>
        <DialogSelect
          title="Save prompt changes?"
          options={[
            { value: "save", title: "Save changes" },
            { value: "discard", title: "Discard changes" },
            { value: "keep", title: "Keep editing" },
          ]}
          onSelect={(option) => {
            if (option.value === "save") return props.onSave(draft() ?? props.value)
            if (option.value === "discard") return props.onDiscard()
            if (option.value === "keep") return void setAsk(false)
          }}
        />
      </Match>
      <Match when={!ask()}>
        <box paddingLeft={2} paddingRight={2} gap={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Prompt: {props.name}
            </text>
            <text
              fg={theme.textMuted}
              onMouseUp={() => {
                if (!back()) props.onDiscard()
              }}
            >
              esc
            </text>
          </box>
          <textarea
            height={Math.max(8, Math.floor(dimensions().height / 2))}
            ref={(val: TextareaRenderable) => {
              textarea = val
              setTextareaTarget(val)
            }}
            initialValue={draft() ?? props.value}
            textColor={theme.text}
            focusedTextColor={theme.text}
            focusedBackgroundColor={theme.backgroundPanel}
            cursorColor={theme.primary}
            cursorStyle={tuiConfig.cursor}
          />
          <box paddingBottom={1} gap={1} flexDirection="row">
            <text fg={theme.textMuted}>return newline · alt+return save · esc back</text>
          </box>
        </box>
      </Match>
    </Switch>
  )
}

function DialogAgentToolsetView(props: {
  ids: string[]
  servers: string[]
  initial?: Record<string, boolean>
  onDone: (toolset: Record<string, boolean>) => void
}) {
  const SAVE = "\u0000save"
  const [selected, setSelected] = createSignal<Set<string>>(
    new Set(
      Object.entries(props.initial ?? {})
        .filter(([key, enabled]) => enabled && key !== "*")
        .map(([key]) => key),
    ),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: SAVE, title: "Save toolset" },
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
      title="Toolset (select toggles, Save commits)"
      options={options()}
      onSelect={(option) => {
        if (option.value === SAVE) return commit()
        toggle(option.value)
      }}
    />
  )
}

function DialogAgentPermissionView(props: {
  initialDenied: string[]
  onDone: (permission: Record<string, "deny">) => void
}) {
  const SAVE = "\u0000save"
  const [selected, setSelected] = createSignal<Set<string>>(
    new Set(PERMISSIONS.filter((key) => !props.initialDenied.includes(key))),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: SAVE, title: "Save permissions" },
    ...PERMISSIONS.map((key) => ({
      value: key,
      title: key,
      footer: selected().has(key) ? "allow" : "deny",
    })),
  ])

  function toggle(value: string) {
    const next = new Set(selected())
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setSelected(next)
  }

  function commit() {
    const permission = Object.fromEntries(
      PERMISSIONS.filter((key) => !selected().has(key)).map((key) => [key, "deny" as const]),
    )
    props.onDone(permission)
  }

  return (
    <DialogSelect
      title="Permissions (selected = allowed, Save commits)"
      options={options()}
      onSelect={(option) => {
        if (option.value === SAVE) return commit()
        toggle(option.value)
      }}
    />
  )
}
