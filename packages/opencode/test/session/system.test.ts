import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const subagents: Agent.Info[] = [
  {
    name: "zeta",
    description: "Zeta subagent.",
    useWhen: "Use zeta for zeta work.",
    mode: "subagent",
    permission: Permission.fromConfig({}),
    options: {},
  },
  {
    name: "alpha",
    description: "Alpha subagent.",
    mode: "subagent",
    permission: Permission.fromConfig({}),
    options: {},
  },
  {
    name: "middle",
    description: "Middle subagent.",
    mode: "subagent",
    permission: Permission.fromConfig({}),
    options: {},
  },
  {
    name: "primary-agent",
    description: "Primary agent.",
    mode: "primary",
    permission: Permission.fromConfig({}),
    options: {},
  },
]

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Agent.node,
      Layer.mock(Agent.Service, {
        list: () => Effect.succeed(subagents),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ],
  ]),
)

describe("session.system", () => {
  test("selects the Meta prompt for Muse Spark model IDs", () => {
    for (const id of ["meta/muse-spark-preview", "muse-spark-1.1", "muse-spark-1.2"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Spark,")
      expect(prompt).toContain("using Meta Muse Spark.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Meta prompt for Muse Glimmer model IDs", () => {
    for (const id of ["meta/muse-glimmer", "meta/muse-glimmer-30b", "muse-glimmer-30b"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Glimmer,")
      expect(prompt).toContain("using Meta Muse Glimmer.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Kimi prompt for official provider model IDs", () => {
    for (const providerID of ["kimi-for-coding", "moonshotai", "moonshotai-cn"]) {
      const prompt = SystemPrompt.provider({ providerID, api: { id: "k3" } } as Provider.Model)[0]
      expect(prompt).toContain("# Prompt and Tool Use")
    }
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("subagents output lists dispatchable subagents sorted by name", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output =
        (yield* prompt.subagents(build))[0] ??
        (yield* Effect.fail(new NamedError.Unknown({ message: "missing subagents output" })))

      const alpha = output.indexOf("- alpha —")
      const middle = output.indexOf("- middle —")
      const zeta = output.indexOf("- zeta —")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("primary-agent")
      expect(output).toContain("## Subagent session management")
    }),
  )

  it.effect("subagents output includes the Use when line when set", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output =
        (yield* prompt.subagents(build))[0] ??
        (yield* Effect.fail(new NamedError.Unknown({ message: "missing subagents output" })))

      expect(output).toContain("- zeta — Zeta subagent.")
      expect(output).toContain("  Use when: Use zeta for zeta work.")
    }),
  )

  it.effect("subagents output excludes agents denied by the task permission", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const restricted: Agent.Info = {
        ...build,
        permission: Permission.fromConfig({ task: { zeta: "deny" } }),
      }
      const output =
        (yield* prompt.subagents(restricted))[0] ??
        (yield* Effect.fail(new NamedError.Unknown({ message: "missing subagents output" })))

      expect(output).not.toContain("- zeta")
      expect(output).toContain("- alpha")
    }),
  )

  it.effect("subagents output is empty when nothing is dispatchable", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const restricted: Agent.Info = {
        ...build,
        permission: Permission.fromConfig({ task: { "*": "deny" } }),
      }

      expect(yield* prompt.subagents(restricted)).toEqual([])
    }),
  )
})
