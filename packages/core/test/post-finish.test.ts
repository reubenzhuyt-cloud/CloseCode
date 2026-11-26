import { describe, expect } from "bun:test"
import { AIError, TransportError } from "@opencode/ai/effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { ConfigPostFinishPlugin } from "@opencode/core/config/plugin/post-finish"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import type { FileSystem } from "@opencode/core/filesystem"
import { Instance } from "@opencode/core/instance/service"
import { Job } from "@opencode/core/job"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import type { LocationServices } from "@opencode/core/location-services"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionExecution } from "@opencode/core/session/execution"
import { SubagentReport } from "@opencode/core/session/execution/subagent-report"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionRunner } from "@opencode/core/session/runner/index"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { Document, Info, type Entry } from "@opencode/schema/config"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionInbox as Inbox } from "@opencode/schema/session-inbox"
import { AbsolutePath } from "@opencode/schema/schema"
import { TuiEvent } from "@opencode/schema/tui-event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { eq } from "drizzle-orm"
import { Context, DateTime, Effect, Exit, Layer, LayerMap, PubSub, Schema, Scope, Stream } from "effect"
import { testEffect, it } from "./lib/effect"
import { waitUntil } from "./lib/eventually"
import { host } from "./plugin/host"

const parentID = Session.ID.make("ses_post_finish_parent")
const childID = Session.ID.make("ses_post_finish_child")
const decodeInfo = Schema.decodeUnknownSync(Info)

const allowlist = (...list: string[]): Entry[] => [
  new Document({ type: "document", info: decodeInfo({ post_finish: { agents: list } }) }),
]

type Enqueued = {
  readonly type: "session.inbox.enqueued"
  readonly data: { readonly sessionID: Session.ID; readonly item: Inbox.Info }
}

const report = (state: string, agent = "coder", child: Session.ID = childID): Enqueued => ({
  type: "session.inbox.enqueued",
  data: {
    sessionID: parentID,
    item: Inbox.Synthetic.make({
      id: SessionMessage.ID.create(),
      sessionID: parentID,
      time: { created: DateTime.makeUnsafe(0) },
      type: "synthetic",
      delivery: "steer",
      payload: { text: "<background-result />", metadata: { source: "subagent", childID: child, agent, state } },
    }),
  },
})

/** A real dispatch: the parent's prompt, or the plugin's own appendix prompt, both admitted as user items. */
const dispatch = (
  sessionID: Session.ID = childID,
  metadata?: Record<string, unknown>,
): Enqueued => ({
  type: "session.inbox.enqueued",
  data: {
    sessionID,
    item: Inbox.User.make({
      id: SessionMessage.ID.create(),
      sessionID,
      time: { created: DateTime.makeUnsafe(0) },
      type: "user",
      delivery: "steer",
      payload: { text: "Keep going", metadata },
    }),
  },
})

const admitted = Inbox.User.make({
  id: SessionMessage.ID.create(),
  sessionID: childID,
  time: { created: DateTime.makeUnsafe(0) },
  type: "user",
  delivery: "steer",
  payload: { text: "已归档：packages/core/src/config/plugin/post-finish.ts" },
})

const info = (sessionID: Session.ID, metadata?: Session.Metadata, parent?: Session.ID): Session.Info =>
  Session.Info.make({
    id: sessionID,
    projectID: Project.ID.global,
    parentID: parent,
    cost: Money.USD.make(0),
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    location: { directory: AbsolutePath.make("/workspace") },
    time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
    metadata,
  })

// The plugin's receipt publishes to `Bus.Service`; none of these unit cases reach a settlement.
const unusedBus = Layer.succeed(
  Bus.Service,
  Bus.Service.of({
    publish: () => Effect.die("unused bus.publish"),
    publishAll: () => Effect.die("unused bus.publishAll"),
    subscribe: (() => Stream.never) as never,
    log: (() => Stream.never) as never,
    listen: () => Effect.die("unused bus.listen"),
    project: () => Effect.die("unused bus.project"),
    replay: () => Effect.die("unused bus.replay"),
    remove: () => Effect.die("unused bus.remove"),
    claim: () => Effect.die("unused bus.claim"),
  }),
)

/**
 * Runs the plugin against stubbed domains: storage in memory, recording `session.prompt`/`session.update`, and a
 * pubsub standing in for the bus. The caller provides the config entries.
 */
const run = Effect.fnUntraced(function* (
  prompt: (input: {
    readonly sessionID: string
    readonly text: string
    readonly metadata?: Record<string, unknown>
  }) => Effect.Effect<typeof admitted, Error>,
) {
  const stored = new Map<string, Schema.Json>()
  const prompts: {
    sessionID: Session.ID
    text: string
    delivery: string | undefined
    metadata: Record<string, unknown> | undefined
  }[] = []
  const updates: { sessionID: Session.ID; metadata: Session.Metadata | undefined }[] = []
  // A PubSub, like the bus: every published event reaches the subscription, where a Queue would hand it to one waiter.
  const events = yield* PubSub.unbounded<Enqueued>()
  yield* ConfigPostFinishPlugin.Plugin.effect(
    host({
      // SAFETY: the plugin filters this stream by event type only.
      event: { subscribe: () => Stream.fromPubSub(events) as never },
      session: {
        get: (input) =>
          Effect.succeed(
            info(input.sessionID, { host: "kept" }, input.sessionID === childID ? parentID : undefined),
          ),
        update: (input) =>
          Effect.sync(() => {
            updates.push({ sessionID: input.sessionID, metadata: input.metadata })
          }),
        prompt: (input) =>
          Effect.sync(() => {
            prompts.push({
              sessionID: input.sessionID,
              text: input.text,
              delivery: input.delivery,
              metadata: input.metadata,
            })
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
  ).pipe(Effect.provide(unusedBus))
  // Let the forked subscriptions and the config read start.
  yield* Effect.yieldNow
  return {
    prompts,
    updates,
    stored,
    emit: (event: Enqueued) =>
      PubSub.publish(events, event).pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(Effect.yieldNow)),
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

  it.effect("marks the child's next settlement silent without dropping its other metadata", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))

        expect(plugin.updates).toHaveLength(1)
        expect(plugin.updates[0]?.sessionID).toBe(childID)
        expect(plugin.updates[0]?.metadata).toEqual({
          host: "kept",
          [SubagentReport.SILENT_METADATA_KEY]: { silent: true },
        })
        expect(plugin.stored.get(`postfinish-pending:${childID}`)).toBe("coder")
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

  it.effect("re-arms when the parent dispatches into the child again", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(1)
        expect(plugin.prompts[0]?.metadata).toEqual({ source: "post-finish" })
        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)

        // The second dispatch is admitted as a user item into the same child.
        yield* plugin.emit(dispatch())
        expect(plugin.stored.get(`postfinish:${childID}`)).toBeUndefined()
        expect(plugin.stored.get(`postfinish-pending:${childID}`)).toBeUndefined()

        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(2)
        expect(plugin.prompts[1]?.sessionID).toBe(childID)
        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
      }),
    ),
  )

  it.effect("does not re-arm on the appendix prompt's own admission", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(1)

        // `ctx.session.prompt` admits the appendix round as a user item, so it needs its own discriminator.
        yield* plugin.emit(dispatch(childID, { source: "post-finish" }))

        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
        expect(plugin.stored.get(`postfinish-pending:${childID}`)).toBe("coder")
        yield* plugin.emit(report("completed"))
        expect(plugin.prompts).toHaveLength(1)
      }),
    ),
  )

  it.effect("does not re-arm on a synthetic item admitted into the child", () =>
    withConfig(
      allowlist("coder"),
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))
        expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)

        yield* plugin.emit({
          type: "session.inbox.enqueued",
          data: {
            sessionID: childID,
            item: Inbox.Synthetic.make({
              id: SessionMessage.ID.create(),
              sessionID: childID,
              time: { created: DateTime.makeUnsafe(0) },
              type: "synthetic",
              delivery: "steer",
              payload: { text: "notice", metadata: { source: "subagent" } },
            }),
          },
        })

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
        expect(plugin.updates).toEqual([])
        expect(plugin.stored.size).toBe(0)
      }),
    ),
  )

  it.effect("takes the mark back when the round's prompt fails, so a later report retries", () =>
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
        expect(plugin.stored.get(`postfinish-pending:${childID}`)).toBeUndefined()
        // The retry writes the mark again instead of leaving the failed attempt's one behind.
        expect(plugin.updates.map((update) => update.metadata)).toEqual([
          { host: "kept", [SubagentReport.SILENT_METADATA_KEY]: { silent: true } },
          { host: "kept" },
        ])

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

        for (const agent of ["researcher", "reviewer", "explore", "archivist"])
          yield* plugin.emit(report("completed", agent))

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
        expect(plugin.prompts[0]?.text).toContain("UNARCHIVED.md")
      }),
    ),
  )

  it.effect("covers coder when post_finish is true", () =>
    withConfig(
      [new Document({ type: "document", info: decodeInfo({ post_finish: true }) })],
      Effect.gen(function* () {
        const plugin = yield* run(() => Effect.succeed(admitted))

        yield* plugin.emit(report("completed"))

        expect(plugin.prompts).toHaveLength(1)
        expect(plugin.prompts[0]?.sessionID).toBe(childID)
        expect(plugin.stored.get(`postfinish-pending:${childID}`)).toBe("coder")
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

type Drain = (input: Parameters<SessionRunner.Interface["drain"]>[0]) => Effect.Effect<void, SessionRunner.RunError>

const settlement = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionStore.node, SessionInbox.node, SessionProjector.node, Job.node]),
  ),
)

const ANSWER = "Investigation complete"
const APPENDIX = "已归档：packages/core/src/config/plugin/post-finish.ts"

/**
 * The plugin over the real settlement path. Only the edges this test owns are stubbed: the runner writes each round's
 * model answer, and the host session facade is the three operations a plugin calls. The inbox, the metadata
 * projection, the execution claim and the report delivery are the production ones, which is what the assertions read.
 */
const harness = Effect.fnUntraced(function* (answers: ReadonlyArray<string | Error>) {
  const database = yield* Database.Service
  const bus = yield* Bus.Service
  const store = yield* SessionStore.Service
  const jobs = yield* Job.Service
  const inbox = yield* SessionInbox.Service

  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .insert(SessionTable)
    .values([
      {
        id: parentID,
        project_id: Project.ID.global,
        slug: "parent",
        directory: "/project",
        title: "Parent",
        version: "test",
      },
      {
        id: childID,
        project_id: Project.ID.global,
        parent_id: parentID,
        slug: "child",
        directory: "/project",
        title: "Appendix task",
        agent: Agent.ID.make("coder"),
        version: "test",
      },
    ])
    .run()
    .pipe(Effect.orDie)

  const pending = [...answers]
  let seq = 100
  const drain: Drain = (input) => {
    // A report wake on the parent has no model answer of its own.
    if (input.sessionID === parentID) return Effect.void
    const answer = pending.shift()
    if (answer === undefined) return Effect.die(new Error(`unexpected wake of ${input.sessionID}`))
    if (answer instanceof Error)
      return Effect.fail(
        new AIError({
          reason: new TransportError({ message: answer.message, transport: "http", operation: "request" }),
        }),
      )
    seq += 100
    return seedAssistant(database, input.sessionID, seq, answer).pipe(Effect.asVoid)
  }
  const runner = Layer.succeed(
    SessionRunner.Service,
    SessionRunner.Service.of({
      drain: (input) => drain(input).pipe(Effect.as(SessionRunner.DrainResult.Complete())),
    }),
  )
  const locations = Layer.effect(
    LocationServiceMap.Service,
    LayerMap.make(
      () =>
        // The settlement path only needs the Session runner from the Location graph.
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
        runner as unknown as Layer.Layer<LocationServices, FileSystem.DirectoryNotFoundError>,
    ),
  )
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
  const context = yield* Layer.buildWithScope(
    SessionExecution.layer.pipe(
      Layer.provide(Layer.succeed(Database.Service, database)),
      Layer.provide(Layer.succeed(Bus.Service, bus)),
      Layer.provide(Layer.succeed(SessionStore.Service, store)),
      Layer.provide(Layer.succeed(SessionInbox.Service, inbox)),
      Layer.provide(Layer.succeed(Job.Service, jobs)),
      Layer.provide(AppNodeBuilder.build(Instance.node, [LocationServiceMap.node.replace(locations)]).pipe(Layer.fresh)),
    ),
    scope,
  )
  const execution = Context.get(context, SessionExecution.Service)

  const toasts: { message: string; variant: string; duration: number; remainingAnswers: number }[] = []
  yield* bus
    .subscribe(TuiEvent.ToastShow)
    // `remainingAnswers` pins the order: a receipt must follow the appendix round's own answer, never the first one.
    .pipe(
      Stream.runForEach((event) => Effect.sync(() => void toasts.push({ ...event.data, remainingAnswers: pending.length }))),
      Effect.forkScoped({ startImmediately: true }),
    )
  const stored = new Map<string, Schema.Json>()
  yield* ConfigPostFinishPlugin.Plugin.effect(
    host({
      // SAFETY: `bus.subscribe()` with no arguments feeds every type, which the host wrapper filters.
      event: { subscribe: () => bus.subscribe() as never },
      session: {
        get: (input) =>
          store
            .get(input.sessionID)
            .pipe(Effect.flatMap((session) => (session ? Effect.succeed(session) : Effect.die("missing session")))),
        // The publish the real host makes for `session.update`.
        update: (input) =>
          input.metadata === undefined
            ? Effect.void
            : bus
                .publish(SessionEvent.MetadataUpdated, { sessionID: input.sessionID, metadata: input.metadata })
                .pipe(Effect.asVoid),
        prompt: (input) =>
          Effect.gen(function* () {
            const item = yield* inbox.admit({
              id: SessionMessage.ID.create(),
              sessionID: input.sessionID,
              item: {
                type: "user",
                payload: { text: input.text, metadata: input.metadata },
                delivery: input.delivery ?? "steer",
              },
            })
            yield* execution.wake(input.sessionID)
            return item
          }),
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
  ).pipe(
    Effect.provideService(Bus.Service, bus),
    Effect.provide(Config.testLayer(allowlist("coder"))),
  )
  yield* Effect.yieldNow

  return {
    database,
    execution,
    inbox,
    stored,
    answers: pending,
    toasts: () => toasts,
    // One wake plus its whole busy period.
    round: (sessionID: Session.ID) => execution.wake(sessionID).pipe(Effect.andThen(execution.awaitIdle(sessionID))),
    toast: (count: number) => waitUntil(Effect.sync(() => toasts.length >= count)),
  }
})

function reports(items: ReadonlyArray<Inbox.Info>) {
  return items.filter((item) => item.type === "synthetic" && item.payload.metadata?.source === "subagent")
}

function text(item: Inbox.Info | undefined) {
  return item?.type === "synthetic" ? item.payload.text : ""
}

function metadata(database: Database.Service["Service"], sessionID: Session.ID) {
  return database.db
    .select({ metadata: SessionTable.metadata })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)
}

describe("ConfigPostFinishPlugin.Plugin settlement", () => {
  settlement.effect("keeps the appendix round out of the parent inbox and toasts the human once", () =>
    Effect.gen(function* () {
      const plugin = yield* harness([ANSWER, APPENDIX])

      yield* plugin.round(childID)
      yield* plugin.toast(1)
      yield* plugin.execution.awaitIdle(childID)
      yield* plugin.execution.awaitIdle(parentID)

      const delivered = reports(yield* SessionInbox.list(plugin.database.db, parentID))
      expect(delivered).toHaveLength(1)
      expect(text(delivered[0])).toContain(ANSWER)
      // Both rounds ran: the appendix one just never reached the parent.
      expect(plugin.answers).toEqual([])

      expect(plugin.toasts()).toMatchObject([
        { message: "coder 已归档", variant: "success", duration: 5000, remainingAnswers: 0 },
      ])
      // The settlement consumed the mark, so a later round reports again.
      expect((yield* metadata(plugin.database, childID))?.metadata?.["post-finish"]).toBeUndefined()
    }),
  )

  settlement.effect("still reports a round the parent starts itself after the appendix", () =>
    Effect.gen(function* () {
      const plugin = yield* harness([ANSWER, APPENDIX, "Parent follow-up", APPENDIX])

      yield* plugin.round(childID)
      yield* plugin.toast(1)
      yield* plugin.execution.awaitIdle(childID)

      const item = yield* plugin.inbox.admit({
        id: SessionMessage.ID.create(),
        sessionID: childID,
        item: { type: "user", payload: { text: "Check one more thing" }, delivery: "steer" },
      })
      expect(item.type).toBe("user")
      yield* plugin.round(childID)
      yield* plugin.toast(2)
      yield* plugin.execution.awaitIdle(childID)
      yield* plugin.execution.awaitIdle(parentID)

      const delivered = reports(yield* SessionInbox.list(plugin.database.db, parentID))
      expect(delivered).toHaveLength(2)
      expect(text(delivered[1])).toContain("Parent follow-up")
      // The new dispatch re-armed the round, so this reused child archived twice.
      expect(plugin.toasts()).toHaveLength(2)
      expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
    }),
  )

  settlement.effect("starts no further appendix round once the appendix settles", () =>
    Effect.gen(function* () {
      const plugin = yield* harness([ANSWER, APPENDIX])

      yield* plugin.round(childID)
      yield* plugin.toast(1)
      yield* plugin.execution.awaitIdle(childID)
      yield* plugin.execution.awaitIdle(parentID)

      // No dispatch came, so the marker still stands and the settled round cannot recurse into another one.
      expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
      expect(plugin.answers).toEqual([])
      expect(reports(yield* SessionInbox.list(plugin.database.db, parentID))).toHaveLength(1)
      expect(plugin.toasts()).toHaveLength(1)
    }),
  )

  settlement.effect("toasts a failed appendix round once and starts no retry", () =>
    Effect.gen(function* () {
      const plugin = yield* harness([ANSWER, new Error("provider disconnected")])

      yield* plugin.round(childID)
      yield* plugin.toast(1)
      yield* plugin.execution.awaitIdle(childID)
      yield* plugin.execution.awaitIdle(parentID)

      expect(plugin.toasts()).toMatchObject([{ message: "coder 收尾失败", variant: "warning" }])
      expect(reports(yield* SessionInbox.list(plugin.database.db, parentID))).toHaveLength(1)
      // The marker keeps the round from running again, and the mark went with its one settlement.
      expect(plugin.stored.get(`postfinish:${childID}`)).toBe(true)
      expect((yield* metadata(plugin.database, childID))?.metadata?.["post-finish"]).toBeUndefined()
    }),
  )
})

const encodeMessage = Schema.encodeSync(SessionMessage.Info)

function seedAssistant(database: Database.Service["Service"], sessionID: Session.ID, seq: number, text: string) {
  const id = SessionMessage.ID.make(`msg_seed_${sessionID}_${seq}`)
  const { id: _, type, ...data } = encodeMessage(
    SessionMessage.Assistant.make({
      id,
      type: "assistant",
      agent: Agent.ID.make("build"),
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
      content: [SessionMessage.AssistantText.make({ type: "text", text })],
      time: { created: DateTime.makeUnsafe(0), completed: DateTime.makeUnsafe(1) },
    }),
  )
  return database.db
    .insert(SessionMessageTable)
    .values({ id, session_id: sessionID, type, seq, time_created: 0, data })
    .run()
    .pipe(Effect.orDie)
}
