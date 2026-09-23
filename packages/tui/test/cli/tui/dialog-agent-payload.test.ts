import { expect, test } from "bun:test"
import {
  buildAgentPatch,
  buildPermissionOverrides,
  buildSessionAgentSkills,
  cycle,
  editablePermissionOverrides,
  permissionEffect,
  setPermissionEffect,
  toolsetRuleCount,
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

test("editablePermissionOverrides keeps only editable wildcard rules and drops defaults", () => {
  const rules = [
    { action: "*", resource: "*", effect: "allow" as const },
    { action: "external_directory", resource: "~/private/**", effect: "deny" as const },
    { action: "read", resource: "*.env*", effect: "deny" as const },
    { action: "bash", resource: "*", effect: "deny" as const },
    { action: "read", resource: "*", effect: "allow" as const },
  ]
  expect(editablePermissionOverrides(rules)).toEqual([
    { action: "bash", resource: "*", effect: "deny" },
    { action: "read", resource: "*", effect: "allow" },
  ])
})

test("editablePermissionOverrides keeps the last duplicate for an action", () => {
  const rules = [
    { action: "bash", resource: "*", effect: "allow" as const },
    { action: "bash", resource: "*", effect: "deny" as const },
  ]
  expect(editablePermissionOverrides(rules)).toEqual([{ action: "bash", resource: "*", effect: "deny" }])
})

test("editablePermissionOverrides ignores non-editable actions and non-wildcard resources", () => {
  const rules = [
    { action: "lsp", resource: "typescript", effect: "deny" as const },
    { action: "webfetch", resource: "example.com", effect: "allow" as const },
    { action: "glob", resource: "*", effect: "ask" as const },
  ]
  expect(editablePermissionOverrides(rules)).toEqual([{ action: "glob", resource: "*", effect: "ask" }])
})

test("buildAgentPatch from seeded overrides emits only explicit entries", () => {
  const rules = [
    { action: "*", resource: "*", effect: "allow" as const },
    { action: "external_directory", resource: "$HOME/**", effect: "deny" as const },
    { action: "read", resource: "*.env*", effect: "deny" as const },
    { action: "bash", resource: "*", effect: "deny" as const },
  ]
  const draft: AgentPatchDraft = { permissions: editablePermissionOverrides(rules) }
  const patch = buildAgentPatch(draft)
  expect(patch.permissions).toEqual([{ action: "bash", resource: "*", effect: "deny" }])
  expect(patch.permissions).not.toContainEqual({ action: "*", resource: "*", effect: "allow" })
  expect(patch.permissions).not.toContainEqual(
    expect.objectContaining({ action: "external_directory" }),
  )
  expect(patch.permissions).not.toContainEqual(expect.objectContaining({ action: "read" }))
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

test("toolsetRuleCount ignores the built-in mcp default deny", () => {
  expect(toolsetRuleCount(undefined)).toBe(0)
  expect(toolsetRuleCount({ "mcp:*": false })).toBe(0)
  expect(toolsetRuleCount({ "mcp:*": false, "mcp:unityMCP": true })).toBe(1)
  expect(toolsetRuleCount({ "*": false, "github_*": true, "mcp:linear": true })).toBe(3)
})
