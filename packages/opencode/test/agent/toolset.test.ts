import { describe, expect, test } from "bun:test"
import { toolsetAllows } from "../../src/agent/toolset"

describe("toolsetAllows", () => {
  test("absent or empty toolset allows everything", () => {
    expect(toolsetAllows(undefined, ["bash"])).toBe(true)
    expect(toolsetAllows({}, ["bash"])).toBe(true)
  })

  test("allowlist hides unlisted tools", () => {
    expect(toolsetAllows({ read: true, grep: true }, ["read"])).toBe(true)
    expect(toolsetAllows({ read: true, grep: true }, ["bash"])).toBe(false)
  })

  test("star default with explicit allow overrides", () => {
    const toolset = { "*": false, read: true, bash: true }
    expect(toolsetAllows(toolset, ["read"])).toBe(true)
    expect(toolsetAllows(toolset, ["bash"])).toBe(true)
    expect(toolsetAllows(toolset, ["write"])).toBe(false)
  })

  test("star true with explicit deny", () => {
    const toolset = { "*": true, bash: false }
    expect(toolsetAllows(toolset, ["read"])).toBe(true)
    expect(toolsetAllows(toolset, ["bash"])).toBe(false)
  })

  test("glob matches tool names and mcp server prefix", () => {
    const toolset = { "*": false, "github_*": true, "mcp:linear": true }
    expect(toolsetAllows(toolset, ["github_create_issue", "mcp:github"])).toBe(true)
    expect(toolsetAllows(toolset, ["linear_search", "mcp:linear"])).toBe(true)
    expect(toolsetAllows(toolset, ["gitlab_x", "mcp:gitlab"])).toBe(false)
  })
})
