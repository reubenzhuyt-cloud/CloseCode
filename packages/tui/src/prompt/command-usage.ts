import { createStore, produce } from "solid-js/store"
import { useStorageOptional } from "../context/storage"

export type CommandUsage = { count: number; usedAt: number }

export type CommandUsageOption = { name: string; display: string }

export const MAX_COMMAND_USAGE_BOOST = 10
export const COMMAND_USAGE_BOOST_STEP = 0.1

export function commandUsageBoost(count: number) {
  return 1 + Math.min(Math.max(count, 0), MAX_COMMAND_USAGE_BOOST) * COMMAND_USAGE_BOOST_STEP
}

type PersistedState = {
  commands?: Record<string, CommandUsage>
}

export function compareCommandUsage(a: CommandUsageOption, b: CommandUsageOption, usage: Record<string, CommandUsage>) {
  const count = (usage[b.name]?.count ?? 0) - (usage[a.name]?.count ?? 0)
  if (count !== 0) return count
  const used = (usage[b.name]?.usedAt ?? 0) - (usage[a.name]?.usedAt ?? 0)
  if (used !== 0) return used
  return a.display.localeCompare(b.display)
}

export function useCommandUsage() {
  const persisted = useStorageOptional()?.store<PersistedState>("command-usage", {
    initial: { commands: {} },
  })
  const [memory, setMemory] = createStore<PersistedState>({ commands: {} })

  const apply = (mutation: (draft: PersistedState) => void) => {
    if (persisted) return persisted[1](mutation)
    return Promise.resolve(setMemory(produce(mutation)))
  }

  return {
    compare: (a: CommandUsageOption, b: CommandUsageOption) => {
      const commands = persisted ? persisted[0].commands ?? {} : memory.commands ?? {}
      return compareCommandUsage(a, b, commands)
    },
    count(name: string) {
      const commands = persisted ? persisted[0].commands ?? {} : memory.commands ?? {}
      return commands[name]?.count ?? 0
    },
    touch(name: string) {
      void apply((draft) => {
        const commands = (draft.commands ??= {})
        const previous = commands[name]
        commands[name] = { count: (previous?.count ?? 0) + 1, usedAt: Date.now() }
      }).catch((error) => console.error("Failed to persist command usage", error))
    },
  }
}
