import { Agent } from "@opencode/schema/agent"
import { Skill } from "@opencode/schema/skill"
import { Location } from "@opencode/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { AgentNotFoundError, ServiceUnavailableError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

const DiagnosticQuery = Schema.Struct({
  ...LocationQuery.fields,
  agent: Agent.ID.annotate({ description: "Agent ID to diagnose" }),
})

export const SkillGroup = HttpApiGroup.make("server.skill")
  .add(
    HttpApiEndpoint.get("skill.list", "/api/skill", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Skill.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "skill.list",
          summary: "List skills",
          description: "Retrieve currently registered skills.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("skill.diagnostic", "/api/skill/diagnostic", {
      query: DiagnosticQuery,
      success: Location.response(Skill.Diagnostic),
      error: [AgentNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "skill.diagnostic",
          summary: "Diagnose skill visibility",
          description:
            "Report which registered skills the given agent can load, which permission rule denies each hidden skill, and which same-ID entries were shadowed. Read-only.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "skill",
      description: "Experimental skill routes.",
    }),
  )
