export const COMMAND_USAGE_KEY = "command_usage"
export const MAX_COMMAND_USAGE_ENTRIES = 200
export const MAX_COMMAND_USAGE_BOOST = 10
export const COMMAND_USAGE_BOOST_STEP = 0.1

export function commandUsageKey(option: { value?: string; display: string }) {
  return (option.value ?? option.display).trimEnd()
}

export function readCommandUsage(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {}
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  )
  return Object.fromEntries(entries)
}

export function incrementCommandUsage(usage: Record<string, number>, key: string): Record<string, number> {
  const next = { ...usage, [key]: (usage[key] ?? 0) + 1 }
  const entries = Object.entries(next)
  if (entries.length <= MAX_COMMAND_USAGE_ENTRIES) return next
  const kept = entries
    .filter(([entryKey]) => entryKey === key)
    .concat(entries.filter(([entryKey]) => entryKey !== key).sort(([, a], [, b]) => b - a))
  return Object.fromEntries(kept.slice(0, MAX_COMMAND_USAGE_ENTRIES))
}

export function commandUsageBoost(count: number) {
  return 1 + Math.min(Math.max(count, 0), MAX_COMMAND_USAGE_BOOST) * COMMAND_USAGE_BOOST_STEP
}

export function sortCommandsByUsage<T extends { value?: string; display: string }>(
  items: readonly T[],
  usage: Record<string, number>,
): T[] {
  return [...items].sort((a, b) => {
    const diff = (usage[commandUsageKey(b)] ?? 0) - (usage[commandUsageKey(a)] ?? 0)
    return diff !== 0 ? diff : commandUsageKey(a).localeCompare(commandUsageKey(b))
  })
}
