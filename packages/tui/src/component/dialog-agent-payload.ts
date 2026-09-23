import type { PermissionRule, SessionMetadata } from "@opencode/client"
import { isRecord } from "../util/record"

export const AGENT_PERMISSION_ACTIONS = [
  "bash",
  "read",
  "edit",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "task",
  "todowrite",
  "skill",
  "lsp",
] as const

export const AGENT_MODES = ["primary", "subagent", "all"] as const
export const PERMISSION_CHOICES = ["unset", "deny", "allow", "ask"] as const
export const SKILL_LEVELS = ["off", "name", "full"] as const

export type AgentMode = (typeof AGENT_MODES)[number]
export type SkillLevel = (typeof SKILL_LEVELS)[number]
export type PermissionChoice = (typeof PERMISSION_CHOICES)[number]
export type SkillActivation = Record<string, SkillLevel>

export type AgentPatchDraft = {
  description?: string
  mode?: AgentMode
  toolset?: Record<string, boolean>
  permissions?: readonly PermissionRule[]
  skill_activation?: SkillActivation
}

export function cycle<T>(values: readonly T[], current: T): T {
  return values[(values.findIndex((value) => value === current) + 1) % values.length]
}

export function isPermissionChoice(value: unknown): value is PermissionChoice {
  return PERMISSION_CHOICES.some((choice) => choice === value)
}

/** The effective override effect for an action, or "unset" when no wildcard rule applies. */
export function permissionEffect(rules: readonly PermissionRule[], action: string): PermissionChoice {
  const effect = rules.find((item) => item.action === action && item.resource === "*")?.effect
  return isPermissionChoice(effect) ? effect : "unset"
}

/**
 * Replace an action's wildcard override. Unset removes it; any other effect
 * appends a single rule so the config plugin's last-match-wins ordering applies
 * only to explicitly-set overrides.
 */
export function setPermissionEffect(
  rules: readonly PermissionRule[],
  action: string,
  effect: PermissionChoice,
): PermissionRule[] {
  const rest = rules.filter((rule) => !(rule.action === action && rule.resource === "*"))
  if (effect === "unset") return rest
  return [...rest, { action, resource: "*", effect }]
}

/** Emit only explicitly-set overrides. The draft already stores no "unset" rules. */
export function buildPermissionOverrides(rules: readonly PermissionRule[] | undefined): PermissionRule[] {
  return [...(rules ?? [])]
}

/** Build the config agent patch from the draft, omitting untouched fields. */
export function buildAgentPatch(draft: AgentPatchDraft) {
  return {
    ...(draft.description === undefined ? {} : { description: draft.description }),
    ...(draft.mode === undefined ? {} : { mode: draft.mode }),
    ...(draft.toolset === undefined ? {} : { toolset: draft.toolset }),
    ...(draft.permissions === undefined ? {} : { permissions: buildPermissionOverrides(draft.permissions) }),
    ...(draft.skill_activation === undefined ? {} : { skill_activation: draft.skill_activation }),
  }
}

/** Merge the draft skill levels into the session metadata's per-agent record. */
export function buildSessionAgentSkills(
  metadata: SessionMetadata | undefined,
  agentName: string,
  levels: SkillActivation | undefined,
): SessionMetadata {
  const current = metadata ?? {}
  const agentSkills = isRecord(current["agent_skills"]) ? current["agent_skills"] : {}
  return {
    ...current,
    agent_skills: { ...agentSkills, [agentName]: levels ?? {} },
  }
}
