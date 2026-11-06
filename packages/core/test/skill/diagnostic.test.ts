import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Permission } from "@opencode/core/permission"
import { AbsolutePath } from "@opencode/core/schema"
import { Skill } from "@opencode/core/skill"
import { SkillDiagnostic } from "@opencode/core/skill/diagnostic"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Skill.node, Agent.node, Bus.node])))

const info = (id: string, description: string, tags?: string[]) =>
  Skill.Info.make({
    id: Skill.ID.make(id),
    name: Skill.Name.make(id),
    description,
    ...(tags === undefined ? {} : { tags }),
    path: AbsolutePath.make(`/skills/${id}/SKILL.md`),
    content: `# ${id}`,
  })

const diagnose = (permissions: Permission.Ruleset) =>
  Effect.gen(function* () {
    const skills = yield* Skill.Service
    const agents = yield* Agent.Service
    yield* skills.transform((editor) => {
      editor.add(info("unity-edit", "Unity edit", ["unity"]), { source: "project" })
      editor.add(info("unity-edit", "Displaced unity", ["unity"]), { source: "plugin" })
      editor.add(info("plain", "Plain"), { source: "global" })
      editor.add(info("restricted", "Restricted"), { source: "project", agents: ["reviewer"] })
    })
    yield* agents.transform((editor) =>
      editor.update(Agent.ID.make("unitymaster"), (agent) => {
        agent.mode = "subagent"
        agent.permissions = [...permissions]
      }),
    )
    const agent = yield* agents.get(Agent.ID.make("unitymaster"))
    return SkillDiagnostic.diagnose({
      agent: agent!,
      entries: yield* skills.entries(),
      shadowed: yield* skills.shadowed(),
    })
  })

describe("SkillDiagnostic", () => {
  it.effect("reports the winning tag rule, keeps displaced entries out of visible, and warns on agent restrictions", () =>
    diagnose([
      { action: "*", resource: "*", effect: "allow" },
      { action: "skill", resource: "tag:unity", effect: "deny" },
    ]).pipe(
      Effect.map((result) => {
        expect(result).toEqual({
          agent: "unitymaster",
          visible: [
            {
              id: Skill.ID.make("plain"),
              name: Skill.Name.make("plain"),
              description: "Plain",
              source: "global",
            },
          ],
          denied: [
            {
              id: Skill.ID.make("unity-edit"),
              rule: "tag:unity",
              effect: "deny",
              origin: "agent",
            },
          ],
          shadowed: [
            {
              id: Skill.ID.make("unity-edit"),
              name: Skill.Name.make("unity-edit"),
              description: "Displaced unity",
              tags: ["unity"],
              source: "plugin",
              shadowedBy: "project",
            },
          ],
          warnings: [{ code: "agent-restricted", message: "Skill restricted is only available to agents: reviewer" }],
        })
      }),
    ),
  )

  it.effect("honours agent display names in source restrictions", () =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      const agents = yield* Agent.Service
      yield* skills.transform((editor) =>
        editor.add(info("named", "Named"), { source: "project", agents: ["Unity Master"] }),
      )
      yield* agents.transform((editor) =>
        editor.update(Agent.ID.make("unitymaster"), (agent) => {
          agent.name = Agent.Name.make("Unity Master")
          agent.mode = "subagent"
        }),
      )
      const agent = yield* agents.get(Agent.ID.make("unitymaster"))
      const result = SkillDiagnostic.diagnose({
        agent: agent!,
        entries: yield* skills.entries(),
        shadowed: yield* skills.shadowed(),
      })
      expect(result.visible.map((item) => item.id)).toEqual([Skill.ID.make("named")])
      expect(result.warnings).toBeUndefined()
    }),
  )

  it.effect("lets a later ID allow override an earlier tag deny", () =>
    diagnose([
      { action: "skill", resource: "tag:unity", effect: "deny" },
      { action: "skill", resource: "unity-edit", effect: "allow" },
    ]).pipe(
      Effect.map((result) => {
        expect(result.visible.map((item) => item.id)).toContain(Skill.ID.make("unity-edit"))
        expect(result.denied).toEqual([])
      }),
    ),
  )

  it.effect("lets a later tag deny override an earlier ID allow", () =>
    diagnose([
      { action: "skill", resource: "unity-edit", effect: "allow" },
      { action: "skill", resource: "tag:unity", effect: "deny" },
    ]).pipe(
      Effect.map((result) => {
        expect(result.denied).toEqual([
          { id: Skill.ID.make("unity-edit"), rule: "tag:unity", effect: "deny", origin: "agent" },
        ])
      }),
    ),
  )

  it.effect("counts an ask rule as loadable rather than denied", () =>
    diagnose([{ action: "skill", resource: "*", effect: "ask" }]).pipe(
      Effect.map((result) => {
        expect(result.visible.map((item) => item.id)).toEqual([
          Skill.ID.make("plain"),
          Skill.ID.make("unity-edit"),
        ])
        expect(result.denied).toEqual([])
      }),
    ),
  )
})
