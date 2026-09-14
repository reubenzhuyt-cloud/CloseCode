import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Match, Switch } from "solid-js"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useRoute } from "../context/route"
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
type SkillLevel = "off" | "name" | "full"
type Patch = {
  description?: string
  prompt?: string
  mode?: AgentMode
  toolset?: Record<string, boolean>
  permission?: Record<string, "deny">
  skill_activation?: Record<string, SkillLevel>
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return value === "off" || value === "name" || value === "full"
}

export function DialogAgentEdit(props: { name: string; create?: boolean; initialView?: "skills"; onBack?: () => void }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const route = useRoute()
  const [patch, setPatch] = createSignal<Patch>({})
  const [scope, setScope] = createSignal<"project" | "global" | "session">("project")
  const [view, setView] = createSignal<
    "fields" | "mode" | "toolset" | "description" | "permission" | "prompt" | "skills"
  >(props.initialView ?? "fields")
  const [toolIds, setToolIds] = createSignal<string[]>([])
  const [saving, setSaving] = createSignal(false)

  const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)

  function cycleScope() {
    if (!sessionID()) {
      setScope(scope() === "project" ? "global" : "project")
      return
    }
    setScope(scope() === "project" ? "global" : scope() === "global" ? "session" : "project")
  }

  function exit() {
    if (props.onBack) return props.onBack()
    dialog.clear()
  }

  useDialogBack(() => {
    if (view() !== "fields") {
      setView("fields")
      return true
    }
    if (Object.keys(patch()).length === 0) {
      exit()
      return true
    }
    void save()
    return true
  })

  onMount(async () => {
    const result = await sdk.client.tool.ids({}, { throwOnError: true }).catch(() => undefined)
    setToolIds(result?.data ?? [])
  })

  const stored = createMemo(() => sync.data.config.agent?.[props.name] ?? {})
  const storedSkillActivation = createMemo<Record<string, SkillLevel>>(() => {
    const raw = (stored() as Record<string, unknown>)["skill_activation"]
    if (!raw || typeof raw !== "object") return {}
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, SkillLevel] => isSkillLevel(entry[1])),
    )
  })
  const sessionSkillActivation = createMemo<Record<string, SkillLevel>>(() => {
    const id = sessionID()
    if (!id) return {}
    const metadata = sync.session.get(id)?.metadata as Record<string, unknown> | undefined
    const raw = metadata?.["agent_skills"]
    if (!raw || typeof raw !== "object") return {}
    const agent = (raw as Record<string, unknown>)[props.name]
    if (!agent || typeof agent !== "object") return {}
    return Object.fromEntries(
      Object.entries(agent).filter((entry): entry is [string, SkillLevel] => isSkillLevel(entry[1])),
    )
  })
  const activeSkillActivation = createMemo(() =>
    scope() === "session" ? sessionSkillActivation() : storedSkillActivation(),
  )
  const resolved = createMemo(() => sync.data.agent.find((agent) => agent.name === props.name))
  const promptValue = createMemo(() => patch().prompt ?? resolved()?.prompt ?? "")

  const permissionValue = createMemo<Record<string, string> | undefined>(() => {
    const source: unknown = patch().permission ?? stored().permission
    if (!source || typeof source !== "object") return undefined
    return source as Record<string, string>
  })

  const deniedKeys = createMemo(() => {
    const record = permissionValue()
    if (!record) return [] as string[]
    return PERMISSIONS.filter((key) => record[key] === "deny")
  })

  // Close immediately and finish the write in the background: the config.update
  // response is only flushed after the server disposes the instance, so awaiting
  // it (plus the follow-up reads) visibly stalls the dialog.
  async function save() {
    if (saving()) return
    setSaving(true)
    const target = props.name
    const draft = patch()
    const where = scope()
    const id = sessionID()
    exit()

    if (where === "session") {
      if (!id) return toast.error(new Error("No active session"))
      const current = (sync.session.get(id)?.metadata ?? {}) as Record<string, unknown>
      await sdk.client.session
        .update(
          {
            sessionID: id,
            metadata: {
              ...current,
              agent_skills: {
                ...(current["agent_skills"] as Record<string, unknown> | undefined),
                [target]: draft.skill_activation,
              },
            },
          },
          { throwOnError: true },
        )
        .catch((error) => toast.error(error))
      return
    }

    try {
      const payload = { config: { agent: { [target]: draft } } }
      if (where === "global") {
        await sdk.client.global.config.update(payload, { throwOnError: true })
      } else {
        await sdk.client.config.update(payload, { throwOnError: true })
      }
      const result = await sdk.client.app.agents({}, { throwOnError: true })
      sync.set("agent", result.data ?? [])
      const refreshed = await sdk.client.config.get({}, { throwOnError: true })
      if (refreshed.data) sync.set("config", refreshed.data)
    } catch (error) {
      toast.error(error)
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
      {
        value: "skills",
        title: "Skills",
        description: Object.keys(patch().skill_activation ?? activeSkillActivation()).length
          ? `${Object.keys(patch().skill_activation ?? activeSkillActivation()).length} rule(s)`
          : "default",
      },
      { value: "scope", title: "Save to", description: scope() },
      { value: "save", title: "Save", description: "esc also saves and exits" },
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
            if (option.value === "scope") return void cycleScope()
            if (option.value === "mode") return void setView("mode")
            if (option.value === "toolset") return void setView("toolset")
            if (option.value === "permission") return void setView("permission")
            if (option.value === "skills") return void setView("skills")
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
          value={patch().toolset}
          onChange={(toolset) => setPatch({ ...patch(), toolset })}
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
          value={permissionValue()}
          onChange={(permission) => setPatch({ ...patch(), permission })}
        />
      </Match>
      <Match when={view() === "skills"}>
        <DialogAgentSkillView
          value={patch().skill_activation ?? activeSkillActivation()}
          onChange={(value) => setPatch({ ...patch(), skill_activation: value })}
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
  value?: Record<string, boolean>
  onChange: (toolset: Record<string, boolean>) => void
}) {
  const selected = () =>
    new Set(
      Object.entries(props.value ?? {})
        .filter(([key, enabled]) => enabled && key !== "*")
        .map(([key]) => key),
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
    const toolset: Record<string, boolean> = { "*": false }
    for (const id of next) toolset[id] = true
    props.onChange(toolset)
  }

  return (
    <DialogSelect
      title="Toolset (select toggles, esc back)"
      options={options()}
      onSelect={(option) => toggle(option.value)}
    />
  )
}

function DialogAgentPermissionView(props: {
  value?: Record<string, string>
  onChange: (permission: Record<string, "deny">) => void
}) {
  const allowed = () => new Set<string>(PERMISSIONS.filter((key) => props.value?.[key] !== "deny"))

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    PERMISSIONS.map((key) => ({
      value: key,
      title: key,
      footer: allowed().has(key) ? "allow" : "deny",
    })),
  )

  function toggle(value: string) {
    const next = new Set(allowed())
    if (next.has(value)) next.delete(value)
    else next.add(value)
    props.onChange(
      Object.fromEntries(PERMISSIONS.filter((key) => !next.has(key)).map((key) => [key, "deny" as const])),
    )
  }

  return (
    <DialogSelect
      title="Permissions (selected = allowed, esc back)"
      options={options()}
      onSelect={(option) => toggle(option.value)}
    />
  )
}

function DialogAgentSkillView(props: {
  value: Record<string, SkillLevel>
  onChange: (value: Record<string, SkillLevel>) => void
}) {
  const sdk = useSDK()
  const [skills] = createResource(() =>
    sdk.client.app
      .skills({}, { throwOnError: true })
      .then((result) => result.data ?? [])
      .catch(() => undefined),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    (skills() ?? []).map((skill) => ({
      value: skill.name,
      title: skill.name,
      footer: props.value[skill.name] ?? "off",
    })),
  )

  function cycle(value: string) {
    const current = props.value[value] ?? "off"
    props.onChange({ ...props.value, [value]: current === "off" ? "name" : current === "name" ? "full" : "off" })
  }

  return (
    <DialogSelect
      title="Skill activation (select cycles off → name → full, esc back)"
      options={options()}
      onSelect={(option) => cycle(option.value)}
    />
  )
}
