export * as AgentToolset from "./toolset.js"

import { Wildcard } from "../util/wildcard.js"

export type Toolset = Record<string, boolean>

export function toolsetAllows(
  toolset: Toolset | undefined,
  candidates: readonly string[],
  defaultWhenUnspecified = true,
): boolean {
  if (!toolset || Object.keys(toolset).length === 0) return defaultWhenUnspecified
  const ranked = Object.entries(toolset)
    .map(([pattern, enabled], index) => ({ pattern, enabled, index, specificity: specificityOf(pattern) }))
    .sort((a, b) => a.specificity - b.specificity || a.index - b.index)
  let visible = false
  for (const { pattern, enabled } of ranked) {
    if (candidates.some((candidate) => Wildcard.match(candidate, pattern))) visible = enabled
  }
  return visible
}

function specificityOf(pattern: string) {
  if (pattern === "*") return 0
  const literalCount = pattern.replace(/\*/g, "").length
  if (pattern.includes("*")) return 1 + literalCount
  return Number.MAX_SAFE_INTEGER + literalCount
}

export function toolsetAllowsMcp(toolset: Toolset | undefined, candidates: readonly string[]): boolean {
  return toolsetAllows(toolset, candidates, false)
}

// Later writers layer over earlier ones. Keys owned by the later writer are dropped from the base first so their
// insertion position moves to the end, which keeps last-match-wins globbing aligned with source order.
export function mergeToolset(base: Toolset | undefined, value: Toolset): Toolset {
  const keys = new Set(Object.keys(value))
  const rest = base ? Object.entries(base).filter(([key]) => !keys.has(key)) : []
  return { ...Object.fromEntries(rest), ...value }
}
