import { createMemo, createSignal } from "solid-js"
import type { AgentInfo } from "@opencode/client"
import { useLocal } from "../context/local"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { useClient } from "../context/client"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { errorMessage } from "../util/error"
import { DialogAgentEdit, type AgentEditView } from "./dialog-agent-edit"

const CREATE = "\u0000create"
const SYSTEM = "\u0000system"
const HIDDEN = "\u0000hidden"
const BACK = "\u0000back"

type AgentView = "agents" | "system" | "hidden"

export function DialogAgentManage(props: { initialView?: AgentView } = {}) {
  const local = useLocal()
  const data = useData()
  const location = useLocation()
  const client = useClient()
  const dialog = useDialog()
  const toast = useToast()
  const [view, setView] = createSignal<AgentView>(props.initialView ?? "agents")

  const all = createMemo(() => data.location.agent.list(location.ref) ?? [])
  const systemAgents = createMemo(() => all().filter((agent) => agent.id.startsWith("opencode:")))
  const hiddenAgents = createMemo(() => all().filter((agent) => !agent.id.startsWith("opencode:") && agent.hidden))

  const rows = (agents: readonly AgentInfo[]): DialogSelectOption<string>[] =>
    agents.map((agent) => ({
      value: agent.id,
      title: agent.name,
      description: agent.description ?? agent.mode,
    }))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const system = systemAgents()
    const hidden = hiddenAgents()
    if (view() === "system") return [{ value: BACK, title: "← Back" }, ...rows(system)]
    if (view() === "hidden") return [{ value: BACK, title: "← Back" }, ...rows(hidden)]
    return [
      { value: CREATE, title: "+ Create new agent" },
      ...rows(all().filter((agent) => !agent.id.startsWith("opencode:") && !agent.hidden)),
      ...(system.length
        ? [
            {
              value: SYSTEM,
              title: `System agents (${system.length})`,
              description: system.map((agent) => agent.name).join(", "),
            },
          ]
        : []),
      ...(hidden.length ? [{ value: HIDDEN, title: `Hidden (${hidden.length})` }] : []),
    ]
  })

  const isAgentRow = (option: DialogSelectOption<string> | undefined): option is DialogSelectOption<string> =>
    !!option && option.value !== CREATE && option.value !== SYSTEM && option.value !== HIDDEN && option.value !== BACK

  const agent = (id: string) => all().find((item) => item.id === id)

  function openEdit(name: string, options?: { create?: boolean; initialView?: AgentEditView }) {
    dialog.replace(() => (
      <DialogAgentEdit
        name={name}
        create={options?.create}
        initialView={options?.initialView}
        onBack={() => dialog.replace(() => <DialogAgentManage initialView={view()} />)}
      />
    ))
  }

  function remove(name: string) {
    dialog.clear()
    const target = location.ref ?? data.location.default()
    void client.api.config
      .updateAgent({ scope: "project", agents: { [name]: { disabled: true } }, location: { directory: target.directory } })
      .then(() => data.location.agent.sync(location.ref))
      .catch((error) =>
        toast.show({ message: `Failed to disable agent: ${errorMessage(error)}`, variant: "error", duration: 5000 }),
      )
  }

  return (
    <DialogSelect
      title="Agents"
      current={local.agent.current()?.id}
      options={options()}
      actions={[
        {
          command: "dialog.agent.edit",
          title: "edit",
          disabled: (option) => option !== undefined && option.value !== SYSTEM && option.value !== HIDDEN && option.value !== BACK,
          onTrigger: (option) => openEdit(option.value),
        },
        {
          command: "dialog.agent.switch",
          title: "switch",
          disabled: (option) => {
            if (!isAgentRow(option)) return true
            const target = agent(option.value)
            return !target || target.mode === "subagent" || target.hidden
          },
          onTrigger: (option) => {
            local.agent.set(option.value)
            dialog.clear()
          },
        },
        {
          command: "dialog.agent.delete",
          title: "delete",
          disabled: (option) => !isAgentRow(option),
          onTrigger: (option) => {
            const name = option.value
            dialog.replace(() => (
              <DialogConfirm
                title="Disable agent"
                message={`Disable agent ${name}? This writes disabled: true to the project configuration.`}
                label={{ confirm: "disable", cancel: "cancel" }}
                onConfirm={() => remove(name)}
                onCancel={() => dialog.replace(() => <DialogAgentManage initialView={view()} />)}
              />
            ))
          },
        },
      ]}
      onSelect={(option) => {
        if (option.value === SYSTEM) return void setView("system")
        if (option.value === HIDDEN) return void setView("hidden")
        if (option.value === BACK) return void setView("agents")
        if (option.value === CREATE)
          return void dialog.replace(() => <DialogAgentCreate onBack={() => dialog.replace(() => <DialogAgentManage initialView={view()} />)} />)
        openEdit(option.value)
      }}
      onCancel={() => {
        if (view() === "agents") return dialog.clear()
        setView("agents")
      }}
    />
  )
}

function DialogAgentCreate(props: { onBack: () => void }) {
  const dialog = useDialog()
  return (
    <DialogPrompt
      title="New agent name"
      placeholder="e.g. researcher"
      onConfirm={(value) => {
        const name = value.trim()
        if (!name) return
        dialog.replace(() => <DialogAgentEdit name={name} create onBack={props.onBack} />)
      }}
      onCancel={props.onBack}
    />
  )
}
