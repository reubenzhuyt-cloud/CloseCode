import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogAgentEdit } from "./dialog-agent-edit"

const CREATE = "\u0000create"

export function DialogAgentManage() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: CREATE, title: "+ Create new agent" },
    ...sync.data.agent.map((agent) => ({
      value: agent.name,
      title: agent.name,
      description: `${agent.mode}${agent.model ? ` · ${agent.model.providerID}/${agent.model.modelID}` : ""}`,
    })),
  ])

  const isAgentRow = (option: DialogSelectOption<string> | undefined): option is DialogSelectOption<string> =>
    !!option && option.value !== CREATE

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
          onTrigger: (option) => dialog.replace(() => <DialogAgentEdit name={option.value} />),
        },
        {
          command: "dialog.agent.switch",
          title: "switch",
          disabled: (option) =>
            !isAgentRow(option) ||
            sync.data.agent.find((agent) => agent.name === option.value)?.mode === "subagent",
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
        if (option.value === CREATE) {
          const name = (await DialogPrompt.show(dialog, "Agent name", { placeholder: "e.g. researcher" }))?.trim()
          if (!name) return
          dialog.replace(() => <DialogAgentEdit name={name} create />)
          return
        }
        dialog.replace(() => <DialogAgentEdit name={option.value} />)
      }}
    />
  )
}
