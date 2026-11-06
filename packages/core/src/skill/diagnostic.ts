export * as SkillDiagnostic from "./diagnostic.js"

import type { Agent } from "@opencode/schema/agent"
import type { Permission } from "@opencode/schema/permission"
import { evaluateAny } from "../permission.js"
import { Skill } from "../skill.js"

export type Origin = "agent" | "global" | "session"

export interface Input {
  readonly agent: Agent.Info
  readonly entries: ReadonlyArray<Skill.Entry>
  readonly shadowed: ReadonlyArray<Skill.ShadowedEntry>
}

interface Ruleset {
  readonly origin: Origin
  readonly rules: Permission.Ruleset
}

/**
 * Reports what one agent can actually load. Visibility uses the same checks as the skill tool:
 * the agent's `agents` source restriction plus `Permission.evaluateAny` over the skill's ID and
 * `tag:` candidates. Denials report the winning rule's resource, not the skill ID.
 *
 * The agent ruleset is `Agent.Info.permissions`, which config plugins build by appending global and
 * project document permissions into one array, so provenance is limited to "agent" here; a Session
 * ruleset would be derivable by position if this endpoint ever accepted a session.
 */
export const diagnose = (input: Input): Skill.Diagnostic => {
  const rulesets: Ruleset[] = [{ origin: "agent", rules: input.agent.permissions }]
  const visible: Skill.DiagnosticSkill[] = []
  const denied: Skill.DiagnosticDenial[] = []
  const warnings: Skill.DiagnosticWarning[] = []

  for (const entry of input.entries) {
    if (!Skill.visible(entry, input.agent)) {
      warnings.push({
        code: "agent-restricted",
        message: `Skill ${entry.skill.id} is only available to agents: ${entry.agents?.join(", ")}`,
      })
      continue
    }
    const rule = evaluateAny("skill", Skill.resources(entry.skill), ...rulesets.map((ruleset) => ruleset.rules))
    if (rule.effect !== "deny") {
      visible.push(summary(entry.skill, entry.source))
      continue
    }
    denied.push({
      id: entry.skill.id,
      rule: rule.resource,
      effect: "deny",
      origin: originOf(rule, rulesets),
    })
  }

  return {
    agent: input.agent.id,
    visible: visible.toSorted(byID),
    denied: denied.toSorted(byID),
    shadowed: input.shadowed
      .map((entry) => ({ ...summary(entry.skill, entry.source), shadowedBy: entry.shadowedBy }))
      .toSorted(byID),
    ...(warnings.length === 0 ? {} : { warnings }),
  }
}

const summary = (skill: Skill.Info, source: Skill.Origin): Skill.DiagnosticSkill => ({
  id: skill.id,
  name: skill.name,
  ...(skill.description === undefined ? {} : { description: skill.description }),
  ...(skill.tags === undefined ? {} : { tags: [...skill.tags] }),
  source,
})

const originOf = (rule: Permission.Rule, rulesets: ReadonlyArray<Ruleset>): Origin =>
  rulesets.findLast((ruleset) => ruleset.rules.includes(rule))?.origin ?? "agent"

const byID = (a: { readonly id: string }, b: { readonly id: string }) => a.id.localeCompare(b.id)
