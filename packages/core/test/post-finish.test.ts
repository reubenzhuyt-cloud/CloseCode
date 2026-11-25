import { describe, expect } from "bun:test"
import { Config } from "@opencode/core/config"
import { ConfigPostFinishPlugin } from "@opencode/core/config/plugin/post-finish"
import { Document, Info, type Entry } from "@opencode/schema/config"
import { Session } from "@opencode/schema/session"
import { SessionInbox } from "@opencode/schema/session-inbox"
import { SessionMessage } from "@opencode/schema/session-message"
import { DateTime, Effect, Queue, Schema, Stream } from "effect"
import { it } from "./lib/effect"
import { host } from "./plugin/host"
const parentID = Session.ID.make("ses_post_finish_parent")
const childID = Session.ID.make("ses_post_finish_child")
const decodeInfo = Schema.decodeUnknownSync(Info)

const allowlist = (...list: string[]): Entry[] => [
  new Document({ type: "document", info: decodeInfo({ post_finish: { agents: list } }) }),
]

type Enqueued = { readonly type: "session.inbox.enqueued"; readonly data: { readonly item: SessionInbox.Info } }

const report = (state: string, agent = "coder", child: Session.ID = childID): Enqueued => ({
  type: "session.inbox.enqueued",
  data: {
    item: SessionInbox.Synthetic.make({
      id: SessionMessage.ID.create(),
      sessionID: parentID,
      time: { created: DateTime.makeUnsafe(0) },
      type: "synthetic",
      delivery: "steer",
      payload: { text: "<background-result />", metadata: { source: "subagent", childID: child, agent, state } },
    }),
  },
})

const admitted = SessionInbox.User.make({
  id: SessionMessage.ID.create(),
  sessionID: childID,
  time: { created: DateTime.makeUnsafe(0) },
  type: "user",
  delivery: "steer",
  payload: { text: "已归档：packages/core/src/config/plugin/post-finish.ts" },
})

/**
 * Runs the plugin against stubbed domains: storage in memory, a recording `session.prompt`, and a queue standing in for
 * the bus. The caller provides the config entries.
 */
const run = Effect.fnUntraced(function* (
  prompt: (input: { readonly sessionID: string; readonly text: string }) => Effect.Effect<typeof admitted, Error>,
) {
  const stored = new Map<string, Schema.Json>()
  const prompts: { sessionID: Session.ID; text: string; delivery: string | undefined }[] = []
  const events = yield* Queue.unbounded<Enqueued>()
  yield* ConfigPostFinishPlugin.Plugin.effect(
    host({
      // SAFETY: the plugin filters this stream by event type only.
      event: { subscribe: () => Stream.fromQueue(events) as never },
      session: {
        prompt: (input) =>
          Effect.sync(() => {
            prompts.push({ sessionID: input.sessionID, text: input.text, delivery: input.delivery })
          }).pipe(Effect.andThen(prompt(input))),
      },
      storage: {
        get: (key) => Effect.sync(() => stored.get(key)),
        set: (key, value) => Effect.sync(() => void stored.set(key, value)),
        remove: (key) => Effect.sync(() => void stored.delete(key)),
        scan: (options) =>
          Effect.sync(() => ({
            entries: [...stored].flatMap(([key, value]) => (key.startsWith(options.prefix) ? [{ key, value }] : [])),
          })),
      },
    }),
  )
  // Let the forked subscription and the config read start.
  yield* Effect.yieldNow
  return {
    prompts,
    stored,
    emit: (event: Enqueued) =>
      Queue.offer(events, event).pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(Effect.yieldNow)),
  }
})

const withConfig = <A, E, R>(entries: Entry[], effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(Config.testLayer(entries)))

describe("ConfigPostFinishPlugin.Plugin", () => {
  it.effect("gives an allowlisted child one appendix round after it reports completed", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toHaveLength(1)
        expect(plugin.prompts[0]?.sessionID).toBe(childID)
        expect(plugin.prompts[0]?.delivery).toBe("steer")
        expect(plugin.prompts[0]?.text).toContain("UNARCHIVED.md")
        expect(plugin.prompts[0]?.text).toContain("NO-DELTA")
      }),
    ),
  )

  it.effect("does not give the appendix round's own report a second round", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))
        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toHaveLength(1)
        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
      }),
    ),
  )

  it.effect("never starts an appendix round for a cancelled report", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("cancelled"))

        expect(plugin.prompts).toEqual([])
        expect(plugin.stored.size).toBe(0)
      }),
    ),
  )

  it.effect("leaves the marker unset when the round's prompt fails, so a later report retries", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        let attempts = 0
        const plugin = yield* run(() =>
          Effect.suspend(() => {
            attempts++
            return attempts === 1 ? Effect.fail(new Error("child session is gone")) : Effect.succeed(admitted)
          }),
        )

        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(1)
        expect(plugin.stored.size).toBe(0)

        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(2)
        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
      }),
    ),
  )

  it.effect("ignores an agent outside the configured allowlist", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed", "build"))

        expect(plugin.prompts).toEqual([])
      }),
    ),
  )

  it.effect("refuses a read-only agent even when the config lists it", () =>
    withConfig(
      allowlist("researcher", "reviewer", "explore", "archivist"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        for (const agent of ["researcher", "reviewer", "explore", "archivist"]) yield* plugin.emit(report("completed", agent))

        expect(plugin.prompts).toEqual([])
      }),
    ),
  )

  it.effect("stays off when post_finish is false", () =>
    withConfig(
      [new Document({ type: "document", info: decodeInfo({ post_finish: false }) })],
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toEqual([])
      }),
    ),
  )

  it.effect("covers coder by default when the key is absent", () =>
    withConfig(
      [],
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toHaveLength(1)
      }),
    ),
  )

  it.effect("reads the allowlist per report, so a reload takes effect without a restart", () =>
    withConfig(
      [],
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))
        const config = yield* Config.Test

        yield* config.setEntries(allowlist("build"))
        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toEqual([])
      }),
    ),
  )
})
