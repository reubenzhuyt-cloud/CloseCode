import { expect, test } from "bun:test"
import {
  buildAgentPatch,
  buildPermissionOverrides,
  buildSessionAgentSkills,
  cycle,
  permissionEffect,
  setPermissionEffect,
  type AgentPatchDraft,
} from "../../../src/component/dialog-agent-payload"

test("buildAgentPatch emits only touched fields for project scope", () => {
  const draft: AgentPatchDraft = {
    description: "hello",
    mode: "subagent",
  }
  expect(buildAgentPatch(draft)).toEqual({ description: "hello", mode: "subagent" })
})

test("buildAgentPatch omits untouched fields entirely", () => {
  expect(buildAgentPatch({})).toEqual({})
})

test("buildAgentPatch emits only non-unset permission overrides", () => {
  const draft: AgentPatchDraft = {
    permissions: [
      { action: "bash", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
    ],
  }
  expect(buildAgentPatch(draft)).toEqual({
    permissions: [
      { action: "bash", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
    ],
  })
})

test("buildAgentPatch includes toolset and skill activation when present", () => {
  expect(buildAgentPatch({ toolset: { "mcp:linear": true, mcp: false }, skill_activation: { effect: "name" } })).toEqual(
    {
      toolset: { "mcp:linear": true, mcp: false },
      skill_activation: { effect: "name" },
    },
  )
})

test("permissionEffect reads the wildcard rule and defaults to unset", () => {
  const rules = [
    { action: "bash", resource: "*", effect: "deny" as const },
    { action: "read", resource: "*.md", effect: "allow" as const },
  ]
  expect(permissionEffect(rules, "bash")).toBe("deny")
  expect(permissionEffect(rules, "read")).toBe("unset")
})

test("setPermissionEffect cycles add and remove wildcard rules", () => {
  const denied = setPermissionEffect([], "bash", "deny")
  expect(denied).toEqual([{ action: "bash", resource: "*", effect: "deny" }])

  const allowed = setPermissionEffect(denied, "bash", "allow")
  expect(allowed).toEqual([{ action: "bash", resource: "*", effect: "allow" }])

  expect(setPermissionEffect(allowed, "bash", "unset")).toEqual([])
})

test("permission choice order cycles unset -> deny -> allow -> ask -> unset", () => {
  const choices = ["unset", "deny", "allow", "ask"] as const
  expect(cycle(choices, "unset")).toBe("deny")
  expect(cycle(choices, "deny")).toBe("allow")
  expect(cycle(choices, "allow")).toBe("ask")
  expect(cycle(choices, "ask")).toBe("unset")
})

test("skills cycle off -> name -> full -> off", () => {
  const levels = ["off", "name", "full"] as const
  expect(cycle(levels, "off")).toBe("name")
  expect(cycle(levels, "name")).toBe("full")
  expect(cycle(levels, "full")).toBe("off")
})

test("buildPermissionOverrides preserves explicitly-set rules", () => {
  expect(buildPermissionOverrides([{ action: "edit", resource: "*", effect: "deny" }])).toEqual([
    { action: "edit", resource: "*", effect: "deny" },
  ])
  expect(buildPermissionOverrides(undefined)).toEqual([])
})

test("buildSessionAgentSkills preserves existing metadata and agents", () => {
  const metadata = {
    other: "value",
    agent_skills: { other_agent: { review: "off" as const } },
  }
  expect(buildSessionAgentSkills(metadata, "build", { effect: "name", review: "full" })).toEqual({
    other: "value",
    agent_skills: {
      other_agent: { review: "off" },
      build: { effect: "name", review: "full" },
    },
  })
})

test("buildSessionAgentSkills starts from empty metadata", () => {
  expect(buildSessionAgentSkills(undefined, "build", { effect: "name" })).toEqual({
    agent_skills: { build: { effect: "name" } },
  })
})
