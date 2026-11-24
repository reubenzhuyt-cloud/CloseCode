import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Agent } from "@opencode/core/agent"
import { Permission } from "@opencode/core/permission"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { Skill } from "@opencode/core/skill"
import { Config } from "@opencode/core/config"
import { Bus } from "@opencode/core/bus"
import { SkillTool } from "@opencode/core/tool/plugin/skill"
import { Tool } from "@opencode/core/tool"
import { tmpdirScoped } from "./fixture/tmpdir"
import { Image } from "@opencode/core/image"
import { it } from "./lib/effect"
import { imagePassthrough } from "./lib/image"
import { permissionLayer } from "./lib/permission"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { toolIdentity, executeTool, registerToolPlugin, toolDefinitions, toolNodeReplacements } from "./lib/tool"
import { registerIntegrationPolicy, setOrganizationPolicy } from "./fixture/policy"

const skillToolNode = makeLocationNode({
  name: "test/skill-tool-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(SkillTool.Plugin)),
  deps: [Tool.node, FSUtil.node, Skill.node, Permission.node, Agent.node],
})

const sessionID = Session.ID.make("ses_skill_tool_test")

describe("SkillTool", () => {
  it.effect("refuses a policy-blocked skill before authorization or content preparation", () =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      const tools = yield* Tool.Service
      // This path does not exist; an attempted content scan would fail the test.
      yield* skills.transform((editor) =>
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make("private"),
            name: Skill.Name.make("Private"),
            path: AbsolutePath.make("/unavailable/private/SKILL.md"),
            content: "Private instructions",
          }),
        ),
      )
      yield* setOrganizationPolicy([{ action: "integration.use", resource: "skill:private", effect: "deny" }])
      yield* registerIntegrationPolicy({ skill: skills })
      expect(
        yield* executeTool(tools, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "call-policy-denied-skill", name: "skill", input: { id: "private" } },
        }),
      ).toEqual({ status: "error", error: { type: "tool.execution", message: "Unable to load skill private" } })
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Tool.node, skillToolNode, Skill.node, Config.node, Bus.node]), [
          Config.node.replace(Config.testLayer()),
          Permission.node.replace(permissionLayer({ assert: () => Effect.die("Blocked skill reached authorization") })),
          Image.node.replace(imagePassthrough),
        ]),
      ),
    ),
  )

  it.effect("blocks a skill load when a tag rule denies it", () => {
    const rules: Permission.Ruleset = [{ action: "skill", resource: "tag:unity", effect: "deny" }]
    const assertions: Permission.AssertInput[] = []
    return Effect.gen(function* () {
      const skills = yield* Skill.Service
      const tools = yield* Tool.Service
      yield* skills.transform((editor) =>
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make("unity-edit"),
            name: Skill.Name.make("Unity Edit"),
            tags: ["unity"],
            path: AbsolutePath.make("/unavailable/unity-edit/SKILL.md"),
            content: "Unity instructions",
          }),
        ),
      )
      expect(
        yield* executeTool(tools, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "call-tag-denied-skill", name: "skill", input: { id: "unity-edit" } },
        }),
      ).toEqual({ status: "error", error: { type: "permission.rejected", message: "Permission denied: skill" } })
      expect(assertions).toMatchObject([
        {
          sessionID,
          action: "skill",
          resources: ["unity-edit"],
          candidates: ["unity-edit", "tag:unity"],
          save: ["unity-edit"],
        },
      ])
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Tool.node, skillToolNode, Skill.node, Config.node]), [
          Config.node.replace(Config.testLayer()),
          Permission.node.replace(
            permissionLayer({
              assert: (input) =>
                Effect.sync(() => assertions.push(input)).pipe(
                  Effect.andThen(
                    Permission.evaluateAny(input.action, [...input.resources, ...(input.candidates ?? [])], rules)
                      .effect === "deny"
                      ? Effect.fail(
                          new Permission.BlockedError({
                            rules: [],
                            permission: input.action,
                            resources: input.resources,
                          }),
                        )
                      : Effect.void,
                  ),
                ),
            }),
          ),
          Image.node.replace(imagePassthrough),
        ]),
      ),
    )
  })

  it.effect("denies a skill whose source is restricted to other agents", () =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      const tools = yield* Tool.Service
      yield* skills.transform((editor) =>
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make("restricted"),
            name: Skill.Name.make("Restricted"),
            path: AbsolutePath.make("/unavailable/restricted/SKILL.md"),
            content: "Restricted instructions",
          }),
          { source: "project", agents: ["reviewer"] },
        ),
      )
      expect(
        yield* executeTool(tools, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "call-agent-restricted", name: "skill", input: { id: "restricted" } },
        }),
      ).toEqual({ status: "error", error: { type: "tool.execution", message: "Unable to load skill restricted" } })
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Tool.node, skillToolNode, Skill.node, Config.node]), [
          Config.node.replace(Config.testLayer()),
          Permission.node.replace(
            permissionLayer({ assert: () => Effect.die("agent-restricted skill reached authorization") }),
          ),
          Image.node.replace(imagePassthrough),
        ]),
      ),
    ),
  )

  it.effect("loads a skill whose source lists the agent display name", () =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      const agents = yield* Agent.Service
      const tools = yield* Tool.Service
      yield* agents.transform((editor) =>
        editor.update(Agent.ID.make("unitymaster"), (agent) => {
          agent.name = Agent.Name.make("Unity Master")
        }),
      )
      yield* skills.transform((editor) =>
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make("unity-edit"),
            name: Skill.Name.make("Unity Edit"),
            path: AbsolutePath.make("/unavailable/unity-edit.md"),
            content: "Unity instructions",
          }),
          { source: "project", agents: ["Unity Master"] },
        ),
      )
      expect(
        yield* executeTool(tools, {
          sessionID,
          ...toolIdentity,
          agent: Agent.ID.make("unitymaster"),
          call: { type: "tool-call", id: "call-display-name", name: "skill", input: { id: "unity-edit" } },
        }),
      ).toMatchObject({ status: "completed", metadata: { name: "Unity Edit" } })
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Tool.node, skillToolNode, Skill.node, Config.node, Agent.node]), [
          Config.node.replace(Config.testLayer()),
          Permission.node.replace(permissionLayer({ assert: () => Effect.void })),
          Image.node.replace(imagePassthrough),
        ]),
      ),
    ),
  )

  it.live("lists available skills, authorizes the selected ID, and loads model-facing content", () =>
    tmpdirScoped().pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const directory = path.join(tmp.path, "effect")
          const location = path.join(directory, "SKILL.md")
          const reference = path.join(directory, "reference.md")
          yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
          yield* Effect.promise(() =>
            Promise.all([fs.writeFile(location, "unused"), fs.writeFile(reference, "reference")]),
          )

          const info: Skill.Info = {
            id: Skill.ID.make("effect"),
            name: Skill.Name.make("Effect"),
            description: "Use Effect",
            path: AbsolutePath.make(location),
            content: "# Effect\n\nGuidance",
          }
          let current = [info]
          const assertions: Permission.AssertInput[] = []
          let deny = false
          const permission = permissionLayer({
            assert: (input) =>
              Effect.sync(() => assertions.push(input)).pipe(
                Effect.andThen(
                  deny
                    ? Effect.fail(
                        new Permission.BlockedError({
                          rules: [],
                          permission: input.action,
                          resources: input.resources,
                        }),
                      )
                    : Effect.void,
                ),
              ),
          })
          const skills = Layer.mock(Skill.Service, {
            get: (id) => Effect.succeed(current.find((skill) => skill.id === id)),
            files: () => Effect.undefined,
            list: () => Effect.succeed(current),
            entries: () => Effect.succeed(current.map((skill) => ({ skill, source: "plugin" as const }))),
          })
          const skillToolLayer = AppNodeBuilder.build(LayerNode.group([Tool.node, skillToolNode]), [
            ...toolNodeReplacements(permission),
            Skill.node.replace(skills),
          ])

          return yield* Effect.gen(function* () {
            const registry = yield* Tool.Service
            expect((yield* toolDefinitions(registry))[0]).toMatchObject({
              name: "skill",
              description: SkillTool.description,
            })
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-skill", name: "skill", input: { id: "effect" } },
              }),
            ).toMatchObject({
              status: "completed",
              content: [{ type: "text", text: Skill.toModelOutput(info, [reference]) }],
            })
            expect(Skill.toModelOutput(info, [reference])).toContain(`Base directory for this skill: ${directory}`)
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-skill-overflow", name: "skill", input: { id: "effect" } },
              }),
            ).toEqual({
              status: "completed",
              output: { directory, content: Skill.toModelOutput(info, [reference]) },
              content: [{ type: "text", text: Skill.toModelOutput(info, [reference]) }],
              metadata: { name: "Effect", directory },
            })
            expect(assertions).toMatchObject([
              { sessionID, action: "skill", resources: ["effect"], save: ["effect"] },
              { sessionID, action: "skill", resources: ["effect"], save: ["effect"] },
            ])
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-missing-skill", name: "skill", input: { id: "missing" } },
              }),
            ).toEqual({
              status: "error",
              error: { type: "tool.execution", message: "Unable to load skill missing" },
            })
            deny = true
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-denied-skill", name: "skill", input: { id: "effect" } },
              }),
            ).toEqual({
              status: "error",
              error: { type: "permission.rejected", message: "Permission denied: skill" },
            })
            deny = false
            const flat = Skill.Info.make({
              id: Skill.ID.make("public"),
              name: Skill.Name.make("Public"),
              description: "Public guidance",
              path: AbsolutePath.make(path.join(tmp.path, "public.md")),
              content: "Public",
            })
            yield* Effect.promise(() =>
              Promise.all([
                fs.writeFile(flat.path, "public"),
                fs.writeFile(path.join(tmp.path, "secret.md"), "secret"),
              ]),
            )
            current = [flat]
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-flat-skill", name: "skill", input: { id: "public" } },
              }),
            ).toMatchObject({
              status: "completed",
              content: [{ type: "text", text: Skill.toModelOutput(flat, []) }],
            })
          }).pipe(Effect.provide(skillToolLayer))
        }),
      ),
    ),
  )
})
