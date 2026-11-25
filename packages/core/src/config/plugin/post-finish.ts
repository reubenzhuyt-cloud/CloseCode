export * as ConfigPostFinishPlugin from "./post-finish.js"

import { define } from "@opencode/plugin/effect/plugin"
import type { Info } from "@opencode/schema/config"
import type { SessionInbox } from "@opencode/schema/session-inbox"
import { Session } from "@opencode/schema/session"
import { Cause, Effect, Stream } from "effect"
import { Config } from "../../config.js"

// Read-only agents write their architecture delta in their own final report, and the archivist is the merger itself,
// so a follow-up round on either would either do nothing or run the merge twice. Refused even when configured.
const READ_ONLY = new Set(["researcher", "reviewer", "explore", "archivist"])
const DEFAULT_AGENTS = ["coder"]
const MARKER = "postfinish:"

// The whole round after the finished boundary: one appendix, no reading, no verification, no git.
const PROMPT = `你已越过 finished 边界。本轮只做一件事。
不要读任何文件：不读源码，不读 docs/architecture/INDEX.md，不读 area 或 module 文档。上一轮的上下文你已经有。
不要改代码、配置或脚本，不要跑 lint/typecheck/测试/构建，不要执行任何 git 命令。
在 docs/architecture/UNARCHIVED.md 追加恰好一个 delta 块，格式遵循根 AGENTS.md 的 Architecture Docs 段落：
task/source、受影响路径与符号、实际改动、验证证据（已有则写）。本任务已有块就更新它，不要加第二个。
只回一行：已归档，后面跟受影响路径。本轮确实没有值得暂存的内容，就只回 NO-DELTA。`

type Enqueued = { readonly data: { readonly item: SessionInbox.Item } }

/**
 * After a subagent reports finished, keep working in its own Session for one appendix round, so the parent never
 * waits for it. Reports reach the parent as synthetic inbox items, so this watches that public event instead of
 * changing the settlement pipeline.
 */
export const Plugin = define({
  id: "opencode.config.post-finish",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service

    // The follow-up round is a second busy period, so its own settlement reports to the parent again as a
    // `<background-result>`. The receipt belongs to the human, not to the parent. Nothing here decides that yet.
    // TODO(post-finish): silence the child's settlement report
    // What this must control: the follow-up busy period's settlement, which `subagent-report.ts:131-145` turns into
    // the parent-visible `<background-result kind="subagent">` (`prepare` -> `recordSubagentReport` ->
    // `deliverReport` -> a synthetic item on the parent). The seam is called only after the follow-up is admitted, so
    // it can key off the marker instead of the child Session.
    const suppressReport = Effect.fn("ConfigPostFinishPlugin.suppressReport")(function* (_childID: string) {
      yield* Effect.void
    })

    const handle = Effect.fn("ConfigPostFinishPlugin.handle")(function* (event: Enqueued) {
      const item = event.data.item
      if (item.type !== "synthetic") return
      const metadata = item.payload.metadata
      if (metadata?.source !== "subagent") return
      if (metadata.state !== "completed" && metadata.state !== "error") return
      const child = metadata.childID
      if (typeof child !== "string") return
      const sessionID = Session.ID.make(child)
      const agent = metadata.agent
      if (typeof agent !== "string") return
      if (READ_ONLY.has(agent)) return
      if (!allowlist(Config.latest(yield* config.entries(), "post_finish")).includes(agent)) return
      // Every report for this child mints a fresh message ID, so the marker is keyed by Session.
      if ((yield* ctx.storage.get(MARKER + child)) !== undefined) return
      yield* ctx.session.prompt({ sessionID, text: PROMPT, delivery: "steer" }).pipe(
        Effect.tap(() => ctx.storage.set(MARKER + child, true)),
        Effect.tap(() => suppressReport(child)),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : Effect.logWarning("post-finish appendix round failed", { sessionID, agent, cause }),
        ),
      )
    })

    yield* ctx.event.subscribe({ types: ["session.inbox.enqueued"] }).pipe(
      Stream.runForEach((event) =>
        // A plugin bug must never break report delivery, which runs this subscription's publisher.
        handle(event).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : Effect.logWarning("post-finish handler failed", { cause }),
          ),
        ),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})

// An absent key defaults to the built-in allowlist; `false`, or an empty `agents` list, covers nobody.
function allowlist(value: Info["post_finish"]) {
  if (value === false) return []
  return value?.agents ?? DEFAULT_AGENTS
}
