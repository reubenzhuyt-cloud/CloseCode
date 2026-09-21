import { describe, expect, test } from "bun:test"
import { mergeToolset, toolsetAllows, toolsetAllowsMcp } from "@opencode/core/tool/toolset"

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

describe("toolsetAllowsMcp", () => {
  test("absent or empty toolset hides MCP", () => {
    expect(toolsetAllowsMcp(undefined, ["weather_current", "mcp:weather"])).toBe(false)
    expect(toolsetAllowsMcp({}, ["weather_current", "mcp:weather"])).toBe(false)
  })

  test("non-MCP keys do not expose MCP", () => {
    expect(toolsetAllowsMcp({ read: true }, ["weather_current", "mcp:weather"])).toBe(false)
  })

  test("explicit mcp server allow exposes its tools", () => {
    expect(toolsetAllowsMcp({ "mcp:weather": true }, ["weather_current", "mcp:weather"])).toBe(true)
    expect(toolsetAllowsMcp({ "mcp:weather": true }, ["calendar_today", "mcp:calendar"])).toBe(false)
  })

  test("explicit tool id allow exposes the tool", () => {
    expect(toolsetAllowsMcp({ weather_current: true }, ["weather_current", "mcp:weather"])).toBe(true)
  })

  test("star true explicitly allows MCP", () => {
    expect(toolsetAllowsMcp({ "*": true }, ["weather_current", "mcp:weather"])).toBe(true)
  })

  test("a true MCP key overrides a star deny", () => {
    expect(toolsetAllowsMcp({ "*": false, "mcp:weather": true }, ["weather_current", "mcp:weather"])).toBe(true)
    expect(toolsetAllowsMcp({ "*": false, "mcp:weather": true }, ["calendar_today", "mcp:calendar"])).toBe(false)
  })

  test("explicit MCP allow wins over a star deny regardless of key order", () => {
    expect(toolsetAllowsMcp({ "mcp:weather": true, "*": false }, ["weather_current", "mcp:weather"])).toBe(true)
    expect(toolsetAllowsMcp({ "mcp:weather": true, "*": false }, ["calendar_today", "mcp:calendar"])).toBe(false)
  })

  test("a specific wildcard allow beats a star deny regardless of key order", () => {
    expect(toolsetAllowsMcp({ "unityMCP*": true, "*": false }, ["unityMCP_x", "mcp:unityMCP"])).toBe(true)
    expect(toolsetAllowsMcp({ "*": false, "unityMCP*": true }, ["unityMCP_x", "mcp:unityMCP"])).toBe(true)
  })

  test("a specific wildcard allow does not leak to unrelated tools", () => {
    expect(toolsetAllowsMcp({ "unityMCP*": true, "*": false }, ["blender_x", "mcp:blender"])).toBe(false)
  })

  test("a specific wildcard deny overrides a broader star allow", () => {
    expect(toolsetAllowsMcp({ "*": true, "unityMCP*": false }, ["unityMCP_x", "mcp:unityMCP"])).toBe(false)
  })

  test("explicit key beats any wildcard regardless of key order", () => {
    expect(toolsetAllowsMcp({ "unityMCP*": false, "mcp:unityMCP": true }, ["unityMCP_x", "mcp:unityMCP"])).toBe(true)
    expect(toolsetAllowsMcp({ "mcp:unityMCP": true, "unityMCP*": false }, ["unityMCP_x", "mcp:unityMCP"])).toBe(true)
  })
})

describe("mergeToolset", () => {
  test("later writer wins and keeps its own key order", () => {
    const merged = mergeToolset({ bash: false }, { "*": true, bash: false })
    expect(Object.keys(merged)).toEqual(["*", "bash"])
    expect(toolsetAllows(merged, ["bash"])).toBe(false)
    expect(toolsetAllows(merged, ["read"])).toBe(true)
  })

  test("preserves earlier keys not redefined by the later writer", () => {
    const merged = mergeToolset({ read: true, grep: true }, { "*": false })
    expect(merged).toEqual({ read: true, grep: true, "*": false })
    expect(toolsetAllows(merged, ["write"])).toBe(false)
  })

  test("explicit MCP allow survives a later wildcard deny", () => {
    const merged = mergeToolset({ "mcp:weather": true }, { "*": false })
    expect(toolsetAllowsMcp(merged, ["weather_current", "mcp:weather"])).toBe(true)
    expect(toolsetAllowsMcp(merged, ["calendar_today", "mcp:calendar"])).toBe(false)
  })
})
