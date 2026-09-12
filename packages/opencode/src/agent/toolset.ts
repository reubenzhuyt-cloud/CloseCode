import { Wildcard } from "@opencode-ai/core/util/wildcard"

export type Toolset = Record<string, boolean>

export function toolsetAllows(toolset: Toolset | undefined, candidates: readonly string[]): boolean {
  if (!toolset || Object.keys(toolset).length === 0) return true
  let visible = false
  for (const [pattern, enabled] of Object.entries(toolset)) {
    if (candidates.some((candidate) => Wildcard.match(candidate, pattern))) visible = enabled
  }
  return visible
}

export * as AgentToolset from "./toolset"
