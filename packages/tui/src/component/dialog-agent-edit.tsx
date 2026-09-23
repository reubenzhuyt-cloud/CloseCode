import { createMemo, createSignal, Match, onMount, Switch } from "solid-js"
import type { PermissionRule } from "@opencode/client"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { useClient } from "../context/client"
import { useRoute } from "../context/route"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { errorMessage } from "../util/error"
import {
  AGENT_MODES,
  AGENT_PERMISSION_ACTIONS,
  PERMISSION_CHOICES,
  SKILL_LEVELS,
  buildAgentPatch,
  buildSessionAgentSkills,
  cycle,
  editablePermissionOverrides,
  permissionEffect,
  setPermissionEffect,
  type AgentMode,
  type SkillLevel,
} from "./dialog-agent-payload"

const MODES = AGENT_MODES
const EFFECTS = PERMISSION_CHOICES
const PERMISSIONS = AGENT_PERMISSION_ACTIONS
const LEVELS = SKILL_LEVELS

type Scope = "project" | "global" | "session"
export type AgentEditView = "fields" | "mode" | "toolset" | "description" | "permissions" | "skills"

type Patch = {
  description?: string
  mode?: AgentMode
  toolset?: Record<string, boolean>
  permissions?: PermissionRule[]
  skill_activation?: Record<string, SkillLevel>
}

export function DialogAgentEdit(props: { name: string; create?: boolean; initialView?: AgentEditView; onBack?: () => void }) {
  const data = useData()
  const location = useLocation()
  const client = useClient()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const [patch, setPatch] = createSignal<Patch>({})
  const [scope, setScope] = createSignal<Scope>("project")
  const [view, setView] = createSignal<AgentEditView>(props.initialView ?? "fields")

  const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)
  const agent = createMemo(() => data.location.agent.list(location.ref)?.find((item) => item.id === props.name))
  const agentName = () => agent()?.name ?? props.name
  const skills = createMemo(() => data.location.skill.list(location.ref) ?? [])
  const servers = createMemo(() => data.location.mcp.server.list(location.ref) ?? [])
  const existing = createMemo(() => (patch().skill_activation ?? agent()?.skillActivation) ?? {})
  const skillLevelOf = (name: string) =>
    skills().some((skill) => skill.id === name)
      ? (existing()[name] ?? (agent()?.mode === "subagent" ? "off" : "full"))
      : "off"
  const permissionOverrides = createMemo(() => patch().permissions ?? editablePermissionOverrides(agent()?.permissions))

  onMount(() => {
    if (data.location.skill.list(location.ref) !== undefined) return
    void data.location.skill.sync(location.ref).catch(() => undefined)
  })

  function cycleScope() {
    if (!sessionID()) return setScope(scope() === "project" ? "global" : "project")
    setScope(cycle(["project", "global", "session"] as const, scope()))
  }

  function exit() {
    if (props.onBack) return props.onBack()
    dialog.clear()
  }

  function save() {
    const id = sessionID()
    const draft = patch()
    const where = scope()
    exit()

    if (where === "session") {
      if (!id)
        return toast.show({
          message: "No active session to save skill settings to",
          variant: "warning",
          duration: 4000,
        })
      const current = data.session.get(id)?.metadata
      void client.api.session
        .update({
          sessionID: id,
          metadata: buildSessionAgentSkills(current, agentName(), draft.skill_activation),
        })
        .then(() => data.session.sync(id))
        .catch((error) =>
          toast.show({
            message: `Failed to save skill settings: ${errorMessage(error)}`,
            variant: "error",
            duration: 5000,
          }),
        )
      return
    }

    const target = location.ref ?? data.location.default()
    void client.api.config
      .updateAgent({
        scope: where,
        agents: { [props.name]: buildAgentPatch(draft) },
        location: { directory: target.directory },
      })
      .then(async () => {
        await data.location.agent.sync(location.ref)
        await data.location.config.sync(location.ref)
      })
      .catch((error) =>
        toast.show({ message: `Failed to save agent: ${errorMessage(error)}`, variant: "error", duration: 5000 }),
      )
  }

  const fields = createMemo<DialogSelectOption<string>[]>(() => {
    const draft = patch()
    const count = (value: Record<string, unknown> | undefined) => Object.keys(value ?? {}).length
    const overrides = permissionOverrides()
    return [
      {
        value: "description",
        title: "Description",
        description: draft.description ?? agent()?.description ?? "(unset)",
      },
      { value: "mode", title: "Mode", description: draft.mode ?? agent()?.mode ?? "primary" },
      {
        value: "toolset",
        title: "Toolset",
        description: draft.toolset ? `${count(draft.toolset)} rule(s)` : "all tools",
      },
      {
        value: "permissions",
        title: "Permissions",
        description: overrides.length ? `${overrides.length} override(s)` : "agent defaults",
      },
      {
        value: "skills",
        title: "Skills",
        description: count(draft.skill_activation ?? agent()?.skillActivation) ? "configured" : "default",
      },
      { value: "scope", title: "Save to", description: scope() },
      { value: "save", title: "Save", description: "project or global scope" },
    ]
  })

  return (
    <Switch>
      <Match when={view() === "fields"}>
        <DialogSelect
          title={`${props.create ? "Create" : "Edit"} agent: ${props.name}`}
          options={fields()}
          onSelect={(option) => {
            if (option.value === "save") return save()
            if (option.value === "scope") return cycleScope()
            if (option.value === "description") return setView("description")
            setView(option.value as AgentEditView)
          }}
          onCancel={exit}
        />
      </Match>
      <Match when={view() === "description"}>
        <DialogPrompt
          title="Agent description"
          value={patch().description ?? agent()?.description ?? ""}
          onConfirm={(value) => {
            setPatch({ ...patch(), description: value })
            setView("fields")
          }}
          onCancel={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "mode"}>
        <DialogSelect
          title="Agent mode"
          options={MODES.map((mode) => ({
            value: mode,
            title: mode,
            footer: (patch().mode ?? agent()?.mode) === mode ? "●" : "",
          }))}
          onSelect={(option) => {
            setPatch({ ...patch(), mode: option.value as AgentMode })
            setView("fields")
          }}
          onCancel={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "toolset"}>
        <DialogAgentToolset
          servers={servers().map((server) => server.name)}
          value={patch().toolset ?? agent()?.toolset}
          onChange={(toolset) => setPatch({ ...patch(), toolset })}
          onBack={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "permissions"}>
        <DialogAgentPermissions
          value={permissionOverrides()}
          onChange={(permissions) => setPatch({ ...patch(), permissions })}
          onBack={() => setView("fields")}
        />
      </Match>
      <Match when={view() === "skills"}>
        <DialogAgentSkills
          skills={skills().map((skill) => skill.id)}
          level={skillLevelOf}
          value={patch().skill_activation ?? agent()?.skillActivation ?? {}}
          onChange={(value) => setPatch({ ...patch(), skill_activation: value })}
          onBack={() => setView("fields")}
        />
      </Match>
    </Switch>
  )
}

function DialogAgentToolset(props: {
  servers: string[]
  value?: Record<string, boolean>
  onChange: (value: Record<string, boolean>) => void
  onBack: () => void
}) {
  const dialog = useDialog()
  const pattern = () => Object.keys(props.value ?? {}).filter((key) => key !== "*" && !key.startsWith("mcp:"))
  const enabled = (key: string) => props.value?.[key] === true
  const options = createMemo<DialogSelectOption<string>[]>(() => [
    ...props.servers.map((server) => ({
      value: `mcp:${server}`,
      title: `mcp:${server}`,
      footer: enabled(`mcp:${server}`) ? "✓" : "",
    })),
    ...pattern().map((value) => ({ value, title: value, footer: enabled(value) ? "✓" : "" })),
  ])

  function toggle(key: string) {
    const next: Record<string, boolean> = {}
    for (const [existing, value] of Object.entries(props.value ?? {})) next[existing] = value
    if (enabled(key)) {
      delete next[key]
      props.onChange(next)
      return
    }
    next[key] = true
    props.onChange(next)
  }

  return (
    <DialogSelect
      title="Toolset (space toggles; add a pattern to allow matching MCP tools)"
      options={options()}
      onSelect={(option) => toggle(option.value)}
      onCancel={props.onBack}
      actions={[
        {
          command: "dialog.agent.toolset.pattern",
          title: "add pattern",
          onTrigger: () =>
            dialog.replace(() => (
              <DialogPrompt
                title="Toolset pattern"
                value="mcp:*"
                onConfirm={(value) => {
                  const key = value.trim()
                  dialog.replace(() => <DialogAgentToolset {...props} />)
                  if (key) props.onChange({ ...(props.value ?? {}), [key]: true })
                }}
                onCancel={() => dialog.replace(() => <DialogAgentToolset {...props} />)}
              />
            )),
        },
      ]}
    />
  )
}

function DialogAgentPermissions(props: {
  value: readonly PermissionRule[]
  onChange: (value: PermissionRule[]) => void
  onBack: () => void
}) {
  return (
    <DialogSelect
      title="Permissions override (select cycles unset → deny → allow → ask)"
      options={PERMISSIONS.map((action) => ({
        value: action,
        title: action,
        footer: permissionEffect(props.value, action),
      }))}
      onSelect={(option) => {
        const next = cycle(EFFECTS, permissionEffect(props.value, option.value))
        props.onChange(setPermissionEffect(props.value, option.value, next))
      }}
      onCancel={props.onBack}
    />
  )
}

function DialogAgentSkills(props: {
  skills: string[]
  level: (name: string) => SkillLevel
  value: Record<string, SkillLevel>
  onChange: (value: Record<string, SkillLevel>) => void
  onBack: () => void
}) {
  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: "*", title: "* (all skills)", footer: props.value["*"] ?? "default" },
    ...props.skills.map((skill) => ({
      value: skill,
      title: skill,
      footer: props.value[skill] ?? props.level(skill),
    })),
  ])

  return (
    <DialogSelect
      title="Skill activation (select cycles off → name → full)"
      options={options()}
      onSelect={(option) => {
        const current = option.value === "*" ? (props.value["*"] ?? "off") : props.level(option.value)
        props.onChange({ ...props.value, [option.value]: cycle(LEVELS, current) })
      }}
      onCancel={props.onBack}
    />
  )
}
