export * as ConfigAutoApprovePlugin from "./auto-approve.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { Config } from "../../config.js"

// Server-side counterpart of the TUI "autoaccept" mode. Clients only answer requests for the session they have
// open, so subagent sessions would otherwise block until someone navigates to them. This only rewrites `ask` to
// `allow`: rule-based denies return before permission hooks run, and a deny set by another hook is left untouched.
export const Plugin = define({
  id: "opencode.config.auto-approve",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    yield* ctx.permission.hook("evaluate", (event) =>
      Effect.gen(function* () {
        if (event.effect !== "ask") return
        if (Config.latest(yield* config.entries(), "auto_approve") !== true) return
        event.effect = "allow"
      }),
    )
  }),
})
