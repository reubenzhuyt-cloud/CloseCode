export * as ConfigPostFinishPlugin from "./post-finish.js"

import { define } from "@opencode/plugin/effect/plugin"
import type { Info } from "@opencode/schema/config"
import type { SessionInbox } from "@opencode/schema/session-inbox"
import { Session } from "@opencode/schema/session"
import { TuiEvent } from "@opencode/schema/tui-event"
import { Cause, Effect, Stream } from "effect"
import { Bus } from "../../bus.js"
import { Config } from "../../config.js"
import { SubagentReport } from "../../session/execution/subagent-report.js"

// Read-only agents write their architecture delta in their own final report, and the archivist is the merger itself,
// so a follow-up round on either would either do nothing or run the merge twice. Refused even when configured.
const READ_ONLY = new Set(["researcher", "reviewer", "explore", "archivist"])
const DEFAULT_AGENTS = ["coder"]
const MARKER = "postfinish:"
// One entry per child Session: the agent whose round is in flight.
const PENDING = "postfinish-pending:"
// The toast schema decodes a missing duration to this; a published payload carries the resolved value.
const TOAST_DURATION = 5000

// The whole round after the finished boundary: one appendix, no reading, no verification, no git.
const PROMPT = `你已越过 finished 边界。本轮只做一件事。
不要读任何文件：不读源码，不读 docs/architecture/INDEX.md，不读 area 或 module 文档。上一轮的上下文你已经有。
不要改代码、配置或脚本，不要跑 lint/typecheck/测试/构建，不要执行任何 git 命令。
在 docs/architecture/UNARCHIVED.md 追加恰好一个 delta 块，格式遵循根 AGENTS.md 的 Architecture Docs 段落：
task/source、受影响路径与符号、实际改动、验证证据（已有则写）。本任务已有块就更新它，不要加第二个。
只回一行：已归档，后面跟受影响路径。本轮确实没有值得暂存的内容，就只回 NO-DELTA。`

type Enqueued = { readonly data: { readonly item: SessionInbox.Item } }
type Settled = { readonly type: string; readonly data: { readonly sessionID: Session.ID } }

/**
 * After a subagent reports finished, keep working in its own Session for one appendix round, so the parent never
 * waits for it. Reports reach the parent as synthetic inbox items, so this watches that public event instead of
 * changing the settlement pipeline.
 */
export const Plugin = define({
  id: "opencode.config.post-finish",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const bus = yield* Bus.Service

    // The appendix round is a second busy period of the same Session, so its settlement would report to the parent
    // again as a `<background-result>`. The receipt belongs to the human, not to the parent: mark the round's
    // settlement silent — core clears the mark in the commit that publishes that settlement, so it covers exactly
    // one round — and toast the human when the round lands.
    const suppressReport = Effect.fn("ConfigPostFinishPlugin.suppressReport")(function* (
      sessionID: Session.ID,
      agent: string,
    ) {
      const session = yield* ctx.session.get({ sessionID })
      // Accepted window: the mark silences whichever settlement commits next, not the round this plugin admits. A
      // parent-initiated follow-up that lands between this write and the appendix round's drain is silenced instead,
      // so its report is dropped while the toast still says archived. Closing that needs a per-round token carried by
      // the settlement, which costs more than the window; the parent's own user-visible round still reports later.
      // Accepted hazard: `session.update` replaces the whole public metadata map (session.ts setMetadata publishes the
      // map; projector.ts writes it whole), so this read-modify-write can drop a public key another writer stored in
      // between. Core's private `$opencode_experimental_cwd` survives because the projector re-reads and re-adds it.
      yield* ctx.session.update({
        sessionID,
        metadata: { ...session.metadata, [SubagentReport.SILENT_METADATA_KEY]: { silent: true } },
      })
      // Written before the prompt is admitted, so this round's settlement can never precede its own receipt.
      yield* ctx.storage.set(PENDING + sessionID, agent)
    })

    const suppressMark = (sessionID: Session.ID) =>
      Effect.gen(function* () {
        const session = yield* ctx.session.get({ sessionID })
        const metadata = Object.entries(session.metadata ?? {}).filter(
          ([key]) => key !== SubagentReport.SILENT_METADATA_KEY,
        )
        yield* ctx.session.update({ sessionID, metadata: Object.fromEntries(metadata) })
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
      yield* suppressReport(sessionID, agent).pipe(
        Effect.andThen(ctx.session.prompt({ sessionID, text: PROMPT, delivery: "steer" })),
        Effect.tap(() => ctx.storage.set(MARKER + child, true)),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : Effect.logWarning("post-finish appendix round failed", { sessionID, agent, cause }).pipe(
                // A mark without a round would silence a report the parent is still owed, so give up both.
                Effect.andThen(ctx.storage.remove(PENDING + sessionID)),
                Effect.andThen(suppressMark(sessionID)),
                Effect.catchCause(() => Effect.void),
              ),
        ),
      )
    })

    // Counts the archive only when the round this plugin admitted actually settles: the pending record is consumed
    // here, and the marker allows one round per child, so this receipt cannot fire twice.
    const settle = Effect.fn("ConfigPostFinishPlugin.settle")(function* (event: Settled) {
      const sessionID = event.data.sessionID
      const pending = yield* ctx.storage.get(PENDING + sessionID)
      if (typeof pending !== "string") return
      yield* ctx.storage.remove(PENDING + sessionID)
      // An interrupted round archived nothing, so it stays quiet; so does a settlement that was never muted.
      if (event.type === "session.execution.interrupted") return
      const failed = event.type === "session.execution.failed"
      // Publishing to the bus keeps the receipt out of the parent Session and off the SDK round trip. The Session's
      // own Location is stated rather than inherited: only a TUI watching that directory shows the toast.
      const session = yield* ctx.session.get({ sessionID })
      yield* bus.publish(
        TuiEvent.ToastShow,
        {
          message: failed ? `${pending} 收尾失败` : `${pending} 已归档`,
          variant: failed ? "warning" : "success",
          duration: TOAST_DURATION,
        },
        { location: session.location },
      )
    })

    // One subscription for both streams: the bus keeps publish order across types within a subscription, so the
    // original completed report is always handled before the settlement that follows it. Separate subscriptions could
    // race the other way and mistake the original settlement for the appendix round's.
    yield* ctx.event
      .subscribe({
        types: [
          "session.inbox.enqueued",
          "session.execution.succeeded",
          "session.execution.failed",
          "session.execution.interrupted",
        ],
      })
      .pipe(
        Stream.runForEach((event) => {
          // A plugin bug must never break report delivery, which runs this stream's publisher.
          const handled = event.type === "session.inbox.enqueued" ? handle(event) : settle(event)
          return handled.pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.interrupt
                : Effect.logWarning("post-finish handler failed", { cause }),
            ),
          )
        }),
        Effect.forkScoped({ startImmediately: true }),
      )
  }),
})

// An absent key or `true` defaults to the built-in allowlist; `false`, or an empty `agents` list, covers nobody.
function allowlist(value: Info["post_finish"]) {
  if (value === false) return []
  if (value === true || value === undefined) return DEFAULT_AGENTS
  return value.agents ?? DEFAULT_AGENTS
}
