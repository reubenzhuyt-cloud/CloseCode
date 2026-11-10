export * as ConfigSkillPlugin from "./skill.js"

import { define } from "@opencode/plugin/effect/plugin"
import type { Entry } from "@opencode/schema/config"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import path from "path"
import { Effect, FiberMap, PubSub, Semaphore, Stream } from "effect"
import { Config } from "../../config.js"
import { Watcher } from "../../filesystem/watcher.js"
import { Location } from "../../location.js"
import { AbsolutePath } from "../../schema.js"
import { Skill } from "../../skill.js"
import { SkillDiscovery } from "../../skill/discovery.js"
import { SkillFile } from "./skill-file.js"
import { SkillScan } from "./skill-scan.js"

type Source = {
  readonly source: Skill.DirectorySource | Skill.UrlSource
  agents?: readonly string[]
  tags?: readonly string[]
}

type Discovered = {
  readonly skill: Skill.Info
  readonly source: Skill.Origin
  readonly agents?: readonly string[]
}

const unionTags = (a?: readonly string[], b?: readonly string[]) =>
  a === undefined && b === undefined ? undefined : [...new Set([...(a ?? []), ...(b ?? [])])]

// `agents` absent means unrestricted, so any unrestricted duplicate keeps the source open.
const unionAgents = (a?: readonly string[], b?: readonly string[]) =>
  a === undefined || b === undefined ? undefined : [...new Set([...a, ...b])]

export const Plugin = define({
  id: "opencode.config.skill",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const discovery = yield* SkillDiscovery.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const watcher = yield* Watcher.Service
    const loaded: { entries: Entry[]; skills: Discovered[] } = {
      entries: yield* config.entries(),
      skills: [],
    }
    const watches = yield* FiberMap.make<string>()
    const changes = yield* PubSub.sliding<string>(1)
    const lock = Semaphore.makeUnsafe(1)

    const watch = Effect.fn("ConfigSkillPlugin.watch")(function* (directory: string, type: "file" | "directory") {
      const target = path.resolve(directory)
      const updates = yield* watcher.subscribe(
        type === "directory" ? { path: target, type, ignore: SkillScan.ignore } : { path: target, type },
      )
      yield* FiberMap.run(
        watches,
        `${type}:${target}`,
        updates.pipe(Stream.runForEach((update) => PubSub.publish(changes, update.path).pipe(Effect.asVoid))),
        { onlyIfMissing: true, startImmediately: true },
      )
    })

    function firstMissing(target: string): Effect.Effect<string | undefined> {
      const parent = path.dirname(target)
      if (parent === target) return Effect.undefined
      return fs.isDir(parent).pipe(Effect.flatMap((exists) => (exists ? Effect.succeed(target) : firstMissing(parent))))
    }

    const watchDirectory: (directory: string) => Effect.Effect<string[]> = Effect.fn(
      "ConfigSkillPlugin.watchDirectory",
    )(function* (directory: string) {
      const target = path.resolve(directory)
      const resolved = yield* fs.realPath(directory).pipe(Effect.orElseSucceed(() => undefined))
      if (resolved) {
        yield* watch(resolved, "directory")
        if (resolved !== target) yield* watch(target, "file")
        return resolved === target ? [target] : [target, resolved]
      }
      const missing = yield* firstMissing(target)
      if (missing) yield* watch(missing, "file")
      if (
        yield* fs.realPath(directory).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        )
      ) {
        if (missing) yield* FiberMap.remove(watches, `file:${path.resolve(missing)}`)
        return yield* watchDirectory(directory)
      }
      return [target]
    })

    const sources = () => {
      const result: Source[] = []
      const add = (
        source: Skill.DirectorySource | Skill.UrlSource,
        options?: { readonly agents?: readonly string[]; readonly tags?: readonly string[] },
      ) => {
        const existing = result.find((item) => Skill.Source.equals(item.source, source))
        if (existing) {
          existing.agents = unionAgents(existing.agents, options?.agents)
          existing.tags = unionTags(existing.tags, options?.tags)
          return
        }
        result.push({ source, ...options })
      }
      const directories = loaded.entries.flatMap((entry) => (entry.type === "directory" ? [entry.path] : []))
      const items = loaded.entries.flatMap((entry) => (entry.type === "document" ? (entry.info.skills ?? []) : []))
      for (const directory of directories) {
        add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skill")) }))
        add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skills")) }))
      }
      for (const item of items) {
        const entry = typeof item === "string" ? { path: item } : item
        const options = { agents: entry.agents, tags: entry.tags }
        if (URL.canParse(entry.path) && /^(https?:)$/.test(new URL(entry.path).protocol)) {
          add(Skill.UrlSource.make({ type: "url", url: entry.path }), options)
          continue
        }
        const expanded = entry.path.startsWith("~/") ? path.join(global.home, entry.path.slice(2)) : entry.path
        add(
          Skill.DirectorySource.make({
            type: "directory",
            path: AbsolutePath.make(path.isAbsolute(expanded) ? expanded : path.join(location.directory, expanded)),
          }),
          options,
        )
      }
      return result
    }

    const origin = (filepath: string): Skill.Origin =>
      FSUtil.contains(location.directory, filepath) ? "project" : "global"

    const load = Effect.fn("ConfigSkillPlugin.load")(function* (source: Source) {
      const directories =
        source.source.type === "directory"
          ? [source.source.path]
          : yield* discovery.pull(source.source.url).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("failed to load skill source", {
                  source: Skill.Source.key(source.source),
                  cause,
                }).pipe(Effect.as([] as AbsolutePath[])),
              ),
            )
      const roots = (yield* Effect.forEach(directories, watchDirectory)).flat()
      const skills: Discovered[] = []
      for (const directory of directories) {
        for (const filepath of yield* SkillScan.scan(directory)) {
          const resolved = yield* fs.realPath(filepath).pipe(Effect.orElseSucceed(() => filepath))
          if (!roots.some((root) => FSUtil.contains(root, resolved))) yield* watch(resolved, "file")
          const content = yield* fs.readFileStringSafe(filepath).pipe(Effect.orElseSucceed(() => undefined))
          if (!content) continue
          const parsed = SkillFile.parse(directory, filepath, content)
          if (parsed._tag === "Skipped") {
            yield* Effect.logDebug("skill file skipped", {
              filepath,
              reason: parsed.reason,
              ...(parsed.reason === "frontmatter" ? { issue: parsed.issue } : {}),
            })
            continue
          }
          const tags = unionTags(parsed.skill.tags, source.tags)
          skills.push({
            skill: tags === undefined ? parsed.skill : { ...parsed.skill, tags },
            source: origin(filepath),
            ...(source.agents === undefined ? {} : { agents: source.agents }),
          })
        }
      }
      yield* Effect.logDebug("skill source loaded", {
        source: Skill.Source.key(source.source),
        type: source.source.type,
        directories,
        skills: skills.map((item) => item.skill.id),
      })
      return skills
    })

    const refresh = Effect.fn("ConfigSkillPlugin.refresh")(
      function* (file?: string) {
        yield* FiberMap.clear(watches)
        // Keep every discovered entry: the registry resolves same-ID collisions by origin and
        // records the displaced entry, so collapsing here would lose project > global precedence.
        const skills: Discovered[] = []
        const current = sources()
        for (const source of current) {
          skills.push(...(yield* load(source)))
        }
        loaded.skills = skills
        if (file) {
          yield* Effect.logInfo("skills rescanned", {
            file,
            sources: current.map((item) => Skill.Source.key(item.source)),
            skills: loaded.skills.map((item) => item.skill.id),
          })
        }
      },
      (effect, ..._args: [file?: string]) => lock.withPermit(effect),
    )

    // Editor saves arrive as bursts of watcher events; settle before rescanning once. Subscribe
    // before debouncing so no update slips through while the debounce starts its pull.
    const updates = yield* PubSub.subscribe(changes)
    yield* Stream.fromSubscription(updates).pipe(
      Stream.debounce("100 millis"),
      Stream.runForEach((file) => refresh(file).pipe(Effect.andThen(ctx.skill.reload()))),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* refresh()
    yield* ctx.skill.transform((editor) => {
      for (const item of loaded.skills) {
        editor.add(item.skill, {
          source: item.source,
          ...(item.agents === undefined ? {} : { agents: item.agents }),
        })
      }
    })
    yield* ctx.event.subscribe({ types: ["config.updated"] }).pipe(
      Stream.runForEach(() =>
        config.entries().pipe(
          Effect.tap((entries) => Effect.sync(() => (loaded.entries = entries))),
          Effect.andThen(refresh()),
          Effect.andThen(ctx.skill.reload()),
        ),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
