import { Permission } from "@/permission"
import type { Agent } from "./agent"

export function dispatchable(agents: readonly Agent.Info[], agent: Agent.Info): Agent.Info[] {
  return agents
    .filter((item) => item.mode !== "primary")
    .filter((item) => Permission.evaluate("task", item.name, agent.permission).action !== "deny")
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export * as Subagent from "./subagent"
