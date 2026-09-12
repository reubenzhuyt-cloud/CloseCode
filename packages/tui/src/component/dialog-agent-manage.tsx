import { createMemo } from "solid-js"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogAgent } from "./dialog-agent"
import { DialogAgentEdit } from "./dialog-agent-edit"

const CREATE = "\u0000create"
const DELETE = "\u0000delete"
const SWITCH = "\u0000switch"

export function DialogAgentManage() {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    { value: CREATE, title: "+ Create new agent" },
    { value: SWITCH, title: "Switch agent…" },
    ...sync.data.agent.map((agent) => ({
      value: agent.name,
      title: agent.name,
      description: `${agent.mode}${agent.model ? ` · ${agent.model.providerID}/${agent.model.modelID}` : ""}`,
    })),
    { value: DELETE, title: "− Delete an agent" },
  ])

  async function refresh() {
    const result = await sdk.client.app.agents({}, { throwOnError: true })
    sync.set("agent", result.data ?? [])
  }

  async function remove(name: string) {
    await sdk.client.config.update({ config: { agent: { [name]: { disable: true } } } }, { throwOnError: true })
    await refresh()
    dialog.clear()
  }

  return (
    <DialogSelect
      title="Agents"
      options={options()}
      onSelect={async (option) => {
        if (option.value === CREATE) {
          const name = (await DialogPrompt.show(dialog, "Agent name", { placeholder: "e.g. researcher" }))?.trim()
          if (!name) return
          dialog.replace(() => <DialogAgentEdit name={name} create />)
          return
        }
        if (option.value === SWITCH) {
          dialog.replace(() => <DialogAgent />)
          return
        }
        if (option.value === DELETE) {
          const name = (await DialogPrompt.show(dialog, "Agent name to delete", { placeholder: "agent name" }))?.trim()
          if (!name) return
          const confirmed = await DialogConfirm.show(
            dialog,
            "Delete agent",
            `Delete agent ${name}? This writes disable: true to config.`,
          )
          if (confirmed) await remove(name)
          return
        }
        dialog.replace(() => <DialogAgentEdit name={option.value} />)
      }}
    />
  )
}
