import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { Global } from "@opencode/util/global"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createRoutes } from "../src/routes"

const writeSkill = async (root: string, id: string, description: string, tags: string[] = []) => {
  await fs.mkdir(path.join(root, id), { recursive: true })
  const frontmatter = tags.length === 0 ? "" : `tags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}\n`
  await fs.writeFile(
    path.join(root, id, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${description}\n${frontmatter}---\n# ${id}`,
  )
}

it.live(
  "reports per-agent skill visibility with the denying rule",
  () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped("opencode-skill-diagnostic-")
      const skills = path.join(tmp.path, "skills")
      yield* Effect.promise(async () => {
        await writeSkill(skills, "unity-edit", "Unity edit", ["unity"])
        await writeSkill(skills, "plain", "Plain")
      })
      const context = yield* Layer.build(
        createRoutes(
          {
            password: "secret",
            database: { path: ":memory:" },
            models: { fetch: false },
            fs: { filewatcher: false },
            config: {
              directory: tmp.path,
              project: false,
              content: JSON.stringify({
                skills: [skills],
                agents: {
                  unitymaster: {
                    mode: "subagent",
                    permissions: [{ action: "skill", resource: "tag:unity", effect: "deny" }],
                  },
                  openagent: { mode: "subagent" },
                },
              }),
            },
          },
          () => [],
          [Global.node.replace(Global.layerWith({ config: tmp.path, home: path.join(tmp.path, "home") }))],
        ).pipe(Layer.provide(HttpServer.layerServices)),
      )
      const handler = Context.get(context, HttpRouter.HttpRouter)
        .asHttpEffect()
        .pipe(HttpEffect.toWebHandlerWith(context))
      const get = (route: string) =>
        Effect.promise((signal) => {
          const url = new URL(route, "http://opencode.local")
          url.searchParams.set("location[directory]", tmp.path)
          return handler(
            new Request(url, {
              headers: { authorization: `Basic ${btoa("opencode:secret")}` },
              signal,
            }),
          )
        })
      const body = (response: Response) => Effect.promise(() => response.json())

      const restricted = yield* get("/api/skill/diagnostic?agent=unitymaster").pipe(Effect.timeout("15 seconds"))
      expect(restricted.status).toBe(200)
      const restrictedBody = yield* body(restricted)
      expect(restrictedBody).toMatchObject({
        location: { directory: tmp.path },
        data: {
          agent: "unitymaster",
          denied: [{ id: "unity-edit", rule: "tag:unity", effect: "deny", origin: "agent" }],
        },
      })
      expect(restrictedBody.data.visible.map((item: { id: string }) => item.id)).toContain("plain")
      expect(restrictedBody.data.visible.map((item: { id: string }) => item.id)).not.toContain("unity-edit")
      expect(restrictedBody.data.shadowed).toEqual([])

      const open = yield* get("/api/skill/diagnostic?agent=openagent").pipe(Effect.timeout("15 seconds"))
      expect(open.status).toBe(200)
      const openBody = yield* body(open)
      expect(openBody.data.denied).toEqual([])
      expect(openBody.data.visible.map((item: { id: string }) => item.id)).toEqual(
        expect.arrayContaining(["plain", "unity-edit"]),
      )

      const missing = yield* get("/api/skill/diagnostic?agent=missing").pipe(Effect.timeout("15 seconds"))
      expect(missing.status).toBe(404)
      expect(yield* body(missing)).toMatchObject({ _tag: "AgentNotFoundError", agentID: "missing" })

      const list = yield* get("/api/skill").pipe(Effect.timeout("15 seconds"))
      expect(list.status).toBe(200)
      expect((yield* body(list)).data.map((item: { id: string }) => item.id)).toEqual(
        expect.arrayContaining(["plain", "unity-edit"]),
      )
    }),
  30_000,
)
