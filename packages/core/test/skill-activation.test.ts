import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import type { Session } from "@opencode/schema/session"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { AbsolutePath } from "@opencode/core/schema"
import { Skill } from "@opencode/core/skill"
import { resolveSkillLevels, SkillInstructions } from "@opencode/core/skill/instructions"
import { it } from "./lib/effect"
import { readInitial } from "./lib/instructions"

const skill = (name: string, id: string) =>
  Skill.Info.make({
    id: Skill.ID.make(id),
    name: Skill.Name.make(name),
    description: `${name} description`,
    path: AbsolutePath.make(path.resolve(`/skills/${id}/SKILL.md`)),
    content: `${name} guidance`,
  })

const skillRef = (name: string, id: string) => ({ name: Skill.Name.make(name), id: Skill.ID.make(id) })

const layer = (list: () => Skill.Info[]) =>
  AppNodeBuilder.build(SkillInstructions.node, [
    Skill.node.replace(Layer.mock(Skill.Service, { list: () => Effect.succeed(list()) })),
  ])

const agentInfo = (overrides: Partial<Agent.Info> = {}) =>
  Agent.Info.make({ ...Agent.Info.default(Agent.ID.make("build")), ...overrides })

const render = (list: Skill.Info[], agent: Agent.Info, metadata?: Session.Metadata) =>
  Effect.gen(function* () {
    const instructions = yield* SkillInstructions.Service
    return yield* instructions.load(agent.permissions, { agent, metadata }).pipe(Effect.flatMap(readInitial))
  }).pipe(Effect.provide(layer(() => list)))

const effect = skill("Effect", "effect")
const review = skill("Review", "review")
const hidden = skill("Hidden", "hidden")

describe("resolveSkillLevels", () => {
  const refs = [skillRef("Foo", "foo"), skillRef("Bar", "bar")]

  it.effect("reads configuration keyed by skill name or id, then the wildcard", () =>
    Effect.sync(() => {
      expect(
        resolveSkillLevels(agentInfo({ skillActivation: { Foo: "off", bar: "name", "*": "full" } }), undefined, refs),
      ).toEqual({ Foo: "off", Bar: "name" })
    }),
  )

  it.effect("lets session overrides keyed by name or id beat configuration", () =>
    Effect.sync(() => {
      const metadata = { agent_skills: { build: { Foo: "name", bar: "off" } } }
      expect(
        resolveSkillLevels(agentInfo({ skillActivation: { Foo: "full", Bar: "full" } }), metadata, refs),
      ).toEqual({ Foo: "name", Bar: "off" })
    }),
  )

  it.effect("prefers the session wildcard over configuration", () =>
    Effect.sync(() => {
      const metadata = { agent_skills: { build: { "*": "name" } } }
      expect(resolveSkillLevels(agentInfo({ skillActivation: { "*": "full" } }), metadata, refs)).toEqual({
        Foo: "name",
        Bar: "name",
      })
    }),
  )

  it.effect("falls back to full for primary and all agents and off for subagents", () =>
    Effect.sync(() => {
      expect(resolveSkillLevels(agentInfo({ mode: "primary" }), undefined, refs)).toEqual({ Foo: "full", Bar: "full" })
      expect(resolveSkillLevels(agentInfo({ mode: "all" }), undefined, refs)).toEqual({ Foo: "full", Bar: "full" })
      expect(resolveSkillLevels(agentInfo({ mode: "subagent" }), undefined, refs)).toEqual({ Foo: "off", Bar: "off" })
      expect(resolveSkillLevels(undefined, undefined, refs)).toEqual({ Foo: "full", Bar: "full" })
    }),
  )

  it.effect("ignores malformed or unrelated session overrides", () =>
    Effect.sync(() => {
      const expected: Record<string, SkillInstructions.Level> = { Foo: "full", Bar: "full" }
      expect(resolveSkillLevels(agentInfo(), { agent_skills: { build: { Foo: "bogus" } } }, refs)).toEqual(expected)
      expect(resolveSkillLevels(agentInfo(), { agent_skills: "nope" }, refs)).toEqual(expected)
      expect(resolveSkillLevels(agentInfo(), { agent_skills: { build: "nope" } }, refs)).toEqual(expected)
      expect(resolveSkillLevels(agentInfo(), { agent_skills: { other: { Foo: "off" } } }, refs)).toEqual(expected)
    }),
  )
})

describe("SkillInstructions.load activation levels", () => {
  it.effect("renders full, name-only, and off entries from agent configuration", () =>
    Effect.gen(function* () {
      const initialized = yield* render(
        [effect, review, hidden],
        agentInfo({ skillActivation: { Effect: "full", Review: "name", Hidden: "off" } }),
      )

      expect(initialized.text).toContain("<id>effect</id>")
      expect(initialized.text).toContain("<description>Effect description</description>")
      expect(initialized.text).toContain("<name>Review</name>")
      expect(initialized.text).not.toContain("<description>Review description</description>")
      expect(initialized.text).not.toContain("<id>hidden</id>")
    }),
  )

  it.effect("defaults to full when no agent or metadata is supplied", () =>
    Effect.gen(function* () {
      const initialized = yield* render([effect, review], agentInfo())

      expect(initialized.text).toContain("<description>Effect description</description>")
      expect(initialized.text).toContain("<description>Review description</description>")
    }),
  )

  it.effect("applies session overrides keyed by name or id over configuration", () =>
    Effect.gen(function* () {
      const initialized = yield* render(
        [effect, review],
        agentInfo({ skillActivation: { effect: "off", review: "off" } }),
        { agent_skills: { build: { Effect: "name", review: "full" } } },
      )

      expect(initialized.text).toContain("<name>Effect</name>")
      expect(initialized.text).not.toContain("<description>Effect description</description>")
      expect(initialized.text).toContain("<description>Review description</description>")
    }),
  )
})
