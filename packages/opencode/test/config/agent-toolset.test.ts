import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"

describe("agent toolset config", () => {
  test("preserves toolset through the V1 agent schema", () => {
    const parsed = Schema.decodeUnknownSync(ConfigAgentV1.Info)({
      description: "d",
      toolset: { "*": false, read: true, "github_*": true },
    })
    expect(parsed.toolset).toEqual({ "*": false, read: true, "github_*": true })
    expect((parsed.options as Record<string, unknown> | undefined)?.toolset).toBeUndefined()
  })
})
