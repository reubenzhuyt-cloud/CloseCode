export * as SkillTool from "./skill.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai/effect"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode/util/fs-util"
import { Agent } from "../../agent.js"
import { Skill } from "../../skill.js"
import { Permission } from "../../permission.js"

export const name = "skill"

export const Input = Schema.Struct({
  id: Skill.ID.annotate({ description: "The ID of an available skill or a skill explicitly referenced by the user" }),
})

export const Output = Schema.Struct({
  name: Skill.Name,
  directory: Schema.String,
  output: Schema.String,
})
export const description = [
  "Load a specialized skill's instructions and resources into the current conversation when the task at hand matches its description.",
  "",
  "The skill ID must match an available skill or a skill explicitly referenced by the user.",
].join("\n")

export const toModelOutput = Skill.toModelOutput

const unableToLoad = (name: string, error?: unknown) =>
  new ToolFailure({ message: `Unable to load skill ${name}`, error })

export const Plugin = {
  id: "opencode.tool.skill",
  effect: Effect.fn("SkillTool.Plugin")(function* (ctx: Context) {
    const fs = yield* FSUtil.Service
    const skills = yield* Skill.Service
    const permission = yield* Permission.Service
    const agents = yield* Agent.Service
    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const entry = (yield* skills.entries()).find((item) => item.skill.id === input.id)
              if (!entry) return yield* unableToLoad(input.id)
              // Resolve the full identity so `agents` source restrictions match by ID or display name.
              const agent = (yield* agents.resolve(context.agent)) ?? { id: context.agent }
              if (!Skill.visible(entry, agent)) return yield* unableToLoad(input.id)
              return yield* Effect.gen(function* () {
                yield* permission.assert({
                  action: name,
                  resources: [entry.skill.id],
                  candidates: Skill.resources(entry.skill),
                  save: [entry.skill.id],
                  ...Permission.invocation(context),
                })
                const files = yield* skills.files(entry.skill.id)
                return { name: entry.skill.name, ...(yield* Skill.prepare(fs, entry.skill, files)) }
              }).pipe(Effect.mapError((error) => unableToLoad(input.id, error)))
            }).pipe(
              Effect.map((output) => ({
                output,
                content: output.output,
                metadata: { name: output.name, directory: output.directory },
              })),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
