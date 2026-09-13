import { createMemo, createSignal } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useDialog, useDialogBack } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogAgentEdit } from "./dialog-agent-edit"

const CREATE = "\u0000create"
const SYSTEM = "\u0000system"
const HIDDEN = "\u0000hidden"
const BACK = "\u0000back"

export function DialogAgentManage(props: { initialView?: "agents" | "system" | "hidden" }) {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const [view, setView] = createSignal<"agents" | "system" | "hidden">(props.initialView ?? "agents")

  useDialogBack(() => {
    if (view() !== "agents") {
      setView("agents")
      return true
    }
    return false
  })

  const systemAgents = createMemo(() => sync.data.agent.filter((agent) => agent.native === true))
  const hiddenAgents = createMemo(
    () => sync.data.agent.filter((agent) => agent.native !== true && agent.hidden === true),
  )
  const agentRows = (agents: typeof sync.data.agent) =>
    agents.map((agent) => ({
      value: agent.name,
      title: agent.name,
      description: `${agent.mode}${agent.model ? ` · ${agent.model.providerID}/${agent.model.modelID}` : ""}`,
    }))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const system = systemAgents()
    const hidden = hiddenAgents()
    if (view() === "system") return [{ value: BACK, title: "← Back" }, ...agentRows(system)]
    if (view() === "hidden") return [{ value: BACK, title: "← Back" }, ...agentRows(hidden)]
    return [
      { value: CREATE, title: "+ Create new agent" },
      ...agentRows(sync.data.agent.filter((agent) => agent.native !== true && agent.hidden !== true)),
      ...(system.length
        ? [
            {
              value: SYSTEM,
              title: `System agents (${system.length})`,
              description: system.map((agent) => agent.name).join(", "),
            },
          ]
        : []),
      ...(hidden.length
        ? [
            {
              value: HIDDEN,
              title: `Hidden (${hidden.length})`,
            },
          ]
        : []),
    ]
  })

  const isAgentRow = (option: DialogSelectOption<string> | undefined): option is DialogSelectOption<string> =>
    !!option && option.value !== CREATE && option.value !== SYSTEM && option.value !== HIDDEN && option.value !== BACK

  async function refresh() {
    const result = await sdk.client.app.agents({}, { throwOnError: true })
    sync.set("agent", result.data ?? [])
  }

  async function remove(name: string) {
    try {
      await sdk.client.config.update({ config: { agent: { [name]: { disable: true } } } }, { throwOnError: true })
      await refresh()
      dialog.clear()
    } catch (error) {
      toast.error(error)
    }
  }

  function switchTo(name: string) {
    local.agent.set(name)
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
          disabled: (option) => !isAgentRow(option),
          onTrigger: (option) => {
            const target = view()
            dialog.replace(() => (
              <DialogAgentEdit
                name={option.value}
                onBack={() => dialog.replace(() => <DialogAgentManage initialView={target} />)}
              />
            ))
          },
        },
        {
          command: "dialog.agent.switch",
          title: "switch",
          disabled: (option) => {
            if (!isAgentRow(option)) return true
            const agent = sync.data.agent.find((agent) => agent.name === option.value)
            return agent?.mode === "subagent" || agent?.hidden === true
          },
          onTrigger: (option) => switchTo(option.value),
        },
        {
          command: "dialog.agent.delete",
          title: "delete",
          disabled: (option) => !isAgentRow(option),
          onTrigger: async (option) => {
            const confirmed = await DialogConfirm.show(
              dialog,
              "Delete agent",
              `Delete agent ${option.value}? This writes disable: true to config.`,
            )
            if (confirmed) await remove(option.value)
          },
        },
      ]}
      onSelect={async (option) => {
        if (option.value === SYSTEM) return void setView("system")
        if (option.value === HIDDEN) return void setView("hidden")
        if (option.value === BACK) return void setView("agents")
        if (option.value === CREATE) {
          const target = view()
          const name = (
            await DialogPrompt.show(dialog, "Agent name", {
              placeholder: "e.g. researcher",
              onBack: () => dialog.replace(() => <DialogAgentManage initialView={target} />),
            })
          )?.trim()
          if (!name) return
          dialog.replace(() => (
            <DialogAgentEdit
              name={name}
              create
              onBack={() => dialog.replace(() => <DialogAgentManage initialView={target} />)}
            />
          ))
          return
        }
        const target = view()
        dialog.replace(() => (
          <DialogAgentEdit
            name={option.value}
            onBack={() => dialog.replace(() => <DialogAgentManage initialView={target} />)}
          />
        ))
      }}
    />
  )
}
