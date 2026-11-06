import { Agent } from "@opencode/core/agent"
import { Skill } from "@opencode/core/skill"
import { SkillDiagnostic } from "@opencode/core/skill/diagnostic"
import { AgentNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, response } from "../location"

export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers
    .handle("skill.list", () => response(Skill.Service.use((skill) => skill.list())))
    .handle(
      "skill.diagnostic",
      Effect.fn(function* (ctx) {
        yield* awaitPlugins
        const agent = yield* Agent.Service.use((agents) => agents.resolve(ctx.query.agent))
        if (!agent)
          return yield* new AgentNotFoundError({
            agentID: ctx.query.agent,
            message: `Agent not found: ${ctx.query.agent}`,
          })
        return yield* response(
          Effect.gen(function* () {
            const skill = yield* Skill.Service
            return SkillDiagnostic.diagnose({
              agent,
              entries: yield* skill.entries(),
              shadowed: yield* skill.shadowed(),
            })
          }),
        )
      }),
    ),
)
