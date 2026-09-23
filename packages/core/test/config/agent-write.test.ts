import path from "path"
import fs from "fs/promises"
import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Credential } from "@opencode/core/credential"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { Location } from "@opencode/core/location"
import { AbsolutePath } from "@opencode/core/schema"
import { WellKnown } from "@opencode/core/wellknown"
import { AgentUpdate, Event, Info } from "@opencode/schema/config"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const decodeUpdate = Schema.decodeUnknownSync(AgentUpdate)
const decodeInfo = Schema.decodeUnknownSync(Info)

function testLayer(directory: string, globalDirectory: string) {
  const watcher = Watcher.testLayer
  const built = AppNodeBuilder.build(LayerNode.group([Config.node, Bus.node]), [
    Config.node.replace(Config.configured()),
    Location.node.replace(
      Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
    ),
    Global.node.replace(Global.layerWith({ config: globalDirectory, home: path.join(globalDirectory, "home") })),
    Credential.node.replace(emptyCredentialNode),
    WellKnown.node.replace(emptyWellknownNode),
    Watcher.node.replace(watcher),
  ])
  // Merge the watcher layer by reference so Watcher.Test resolves to the same
  // memoized instance the built graph uses.
  return Layer.mergeAll(built, watcher)
}

function agentFile(documents: readonly { type: string; info?: Info }[]) {
  return documents
    .flatMap((document) => (document.info ? Object.entries(document.info.agents ?? {}) : []))
    .map(([name, agent]) => [name, agent] as const)
}

function writeAndReload(payload: unknown) {
  return Effect.gen(function* () {
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    if (!config.updateAgent) throw new Error("Config agent updates are unavailable")
    const reloaded = yield* bus.subscribe(Event.Updated).pipe(Stream.take(1), Stream.runDrain, Effect.forkScoped)
    yield* config.updateAgent(decodeUpdate(payload))
    yield* Fiber.join(reloaded).pipe(Effect.timeout("5 seconds"))
    return yield* config.entries()
  })
}

describe("Config.updateAgent", () => {
  it.live("creates and merges an agent in the project config while preserving comments and unrelated keys", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const global = path.join(tmp.path, "global")
          const project = path.join(tmp.path, "project")
          const file = path.join(project, "opencode.jsonc")
          yield* Effect.promise(async () => {
            await fs.mkdir(global, { recursive: true })
            await fs.mkdir(project, { recursive: true })
            await fs.writeFile(
              file,
              `{
  // keep this comment
  "shell": "/bin/zsh",
  "agents": {
    "reviewer": {
      "description": "old description",
      "mode": "subagent"
    }
  }
}
`,
            )
          })

          return yield* Effect.gen(function* () {
            const entries = yield* writeAndReload({
              scope: "project",
              agent: {
                reviewer: { description: "new description", disabled: true },
                reviewer2: { mode: "primary" },
              },
            })

            const text = yield* Effect.promise(() => fs.readFile(file, "utf8"))
            expect(text).toContain("// keep this comment")
            expect(text).toContain('"shell": "/bin/zsh"')
            expect(text).toContain('"description": "new description"')
            expect(text).toContain('"disabled": true')
            // Unspecified existing fields of the merged agent survive.
            expect(text).toContain('"mode": "subagent"')

            const agents = Object.fromEntries(agentFile(entries))
            expect(agents.reviewer).toMatchObject({ description: "new description", disabled: true, mode: "subagent" })
            expect(agents.reviewer2).toMatchObject({ mode: "primary" })
          }).pipe(Effect.provide(testLayer(project, global)))
        }),
      ),
    ),
  )

  it.live("preserves unspecified existing agent fields when merging", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const global = path.join(tmp.path, "global")
          const project = path.join(tmp.path, "project")
          const file = path.join(project, "opencode.json")
          yield* Effect.promise(async () => {
            await fs.mkdir(global, { recursive: true })
            await fs.mkdir(project, { recursive: true })
            await fs.writeFile(
              file,
              JSON.stringify({
                agents: {
                  reviewer: {
                    model: "openrouter/openai/gpt-5#high",
                    system: "Review carefully.",
                    steps: 12,
                  },
                },
              }),
            )
          })

          return yield* Effect.gen(function* () {
            const entries = yield* writeAndReload({
              scope: "project",
              agent: { reviewer: { description: "Reviews changes" } },
            })

            const agents = Object.fromEntries(agentFile(entries))
            expect(agents.reviewer).toMatchObject({
              description: "Reviews changes",
              system: "Review carefully.",
              steps: 12,
              model: { providerID: "openrouter", model: "openai/gpt-5", variant: "high" },
            })
          }).pipe(Effect.provide(testLayer(project, global)))
        }),
      ),
    ),
  )

  it.live("round-trips an explicit disabled true", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const global = path.join(tmp.path, "global")
          const project = path.join(tmp.path, "project")
          const file = path.join(project, "opencode.jsonc")
          yield* Effect.promise(async () => {
            await fs.mkdir(global, { recursive: true })
            await fs.mkdir(project, { recursive: true })
          })

          return yield* Effect.gen(function* () {
            const entries = yield* writeAndReload({
              scope: "project",
              agent: { reviewer: { disabled: true, toolset: { mcp: true } } },
            })

            const text = yield* Effect.promise(() => fs.readFile(file, "utf8"))
            expect(text).toContain('"disabled": true')
            expect(text).toContain('"toolset"')
            expect(decodeInfo(JSON.parse(text)).agents?.reviewer).toMatchObject({
              disabled: true,
              toolset: { mcp: true },
            })
            expect(Object.fromEntries(agentFile(entries)).reviewer).toMatchObject({
              disabled: true,
              toolset: { mcp: true },
            })
          }).pipe(Effect.provide(testLayer(project, global)))
        }),
      ),
    ),
  )

  it.live("writes to the global config when the global scope is selected", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const global = path.join(tmp.path, "global")
          const project = path.join(tmp.path, "project")
          yield* Effect.promise(async () => {
            await fs.mkdir(global, { recursive: true })
            await fs.mkdir(project, { recursive: true })
          })

          return yield* Effect.gen(function* () {
            yield* writeAndReload({ scope: "global", agent: { reviewer: { mode: "primary" } } })

            const globalText = yield* Effect.promise(() => fs.readFile(path.join(global, "opencode.jsonc"), "utf8"))
            expect(globalText).toContain('"reviewer"')
            const projectText = yield* Effect.promise(() =>
              fs.readFile(path.join(project, "opencode.jsonc"), "utf8").catch(() => ""),
            )
            expect(projectText).toBe("")
          }).pipe(Effect.provide(testLayer(project, global)))
        }),
      ),
    ),
  )

  test("rejects unknown agent patch fields", () => {
    expect(() => decodeUpdate({ scope: "project", agent: { reviewer: { bogus: true } } })).toThrow()
  })
})
