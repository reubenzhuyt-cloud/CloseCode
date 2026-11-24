import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@opencode/util/effect-flock"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect, test } from "bun:test"
import { Effect, FileSystem, Layer, PlatformError, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

declare const OPENCODE_CLI_NAME: string | undefined

function fixture(
  respond: (command: {
    readonly command: string
    readonly args: ReadonlyArray<string>
  }) => Partial<AppProcess.RunResult> & {
    error?: AppProcess.AppProcessError
  } = () => ({}),
  name = "@opencode/cli",
  failCleanup = false,
  formula?: string,
  executableOverride?: (
    root: string,
    home: string,
  ) => Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-updater-" })
    const execPath = process.execPath
    // npm's global layout on POSIX.
    const modules = path.join(root, "lib", "node_modules")
    const executable = executableOverride
      ? yield* executableOverride(root, path.join(root, "home"))
      : formula
        ? path.join(root, "Cellar", formula, "2.0.20", "bin", "opencode")
        : path.join(modules, ...name.split("/"), "bin", "opencode")
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    if (!formula && !executableOverride)
      yield* fs.writeFileString(
        path.join(modules, ...name.split("/"), "package.json"),
        JSON.stringify({ name, bin: { opencode: "bin/opencode" } }),
      )
    const global = Global.make({
      home: path.join(root, "home"),
      data: path.join(root, "data"),
      cache: path.join(root, "cache"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      tmp: path.join(root, "tmp"),
      bin: path.join(root, "bin"),
      log: path.join(root, "log"),
      repos: path.join(root, "repos"),
    })
    // Windows locates the installer's Git Bash through `git --exec-path`; answer it with a fixture install.
    const git = path.join(root, "Git")
    const bash = process.platform === "win32" ? path.join(git, "bin", "bash.exe") : "bash"
    if (process.platform === "win32") {
      yield* fs.makeDirectory(path.dirname(bash), { recursive: true })
      yield* fs.writeFileString(bash, "bash")
    }
    const commands: string[][] = []
    const paths: Array<string | undefined> = []
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provide(
        LayerNode.compile(EffectFlock.node, {
          replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
        }),
      ),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        remove: (target, options) =>
          failCleanup && target.startsWith(global.cache)
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "remove",
                  pathOrDescriptor: target,
                }),
              )
            : fs.remove(target, options),
        realPath: (input) => (input === execPath ? fs.realPath(executable) : fs.realPath(input)),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.suspend(() => {
              if (command._tag !== "StandardCommand") return Effect.die("Unexpected piped install command")
              const args = command.args.map(String)
              const lookup = command.command === "git" && args[0] === "--exec-path"
              if (!lookup) commands.push([command.command, ...args])
              if (!lookup) paths.push(command.options.env?.PATH?.toString())
              const result = lookup
                ? { stdout: Buffer.from(`${path.join(git, "mingw64", "libexec", "git-core")}\n`) }
                : respond({ command: command.command, args })
              if (result.error) return Effect.fail(result.error)
              return Effect.succeed({
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
              })
            }),
          runStream: () => Stream.die("Unexpected streaming install command"),
        }),
      ),
    )
    const prefix = yield* fs.realPath(root)
    // Windows keeps the npm on PATH and its default prefix.
    const prefixArgs = process.platform === "win32" ? [] : ["--prefix", prefix]
    return { updater, commands, paths, global, fs, executable, bash, prefix, prefixArgs }
  })
}

const windows = process.platform === "win32" ? it.live : it.live.skip
const unix = process.platform === "win32" ? it.live.skip : it.live

// The fork publishes nothing an upgrade could install: every package-manager and WinGet method would
// resolve the upstream OpenCode package, so they refuse instead of replacing CloseCode with upstream.
// This replaces upstream's per-method install assertions (`installs`) with the inverse: no install
// command may run. `curl` stays the only install path (see the CloseCode installer tests below).
const refused = ["npm", "pnpm", "bun", "yarn", "vp", "brew", "winget"] as const

refused.forEach((method) => {
  it.live(`${method} upgrades refuse instead of installing the upstream package`, () =>
    Effect.gen(function* () {
      const test = yield* fixture()
      const error = yield* test.updater.upgrade(method, "2.3.4").pipe(Effect.flip)
      expect(error.message).toBe(
        `CloseCode publishes no update metadata, so ${method} cannot install a CloseCode release.`,
      )
      expect(test.commands).toEqual([])
      expect(yield* test.fs.exists(test.global.cache)).toBe(false)
    }),
  )
})

// Installs a 2.2.7 package at <root>/<directory>, optionally with an npm in <root>/bin.
const installed = (directory: string[], npm = false) =>
  fixture(
    () => ({}),
    "@opencode/cli",
    false,
    undefined,
    (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const pkg = path.join(root, ...directory)
        yield* fs.makeDirectory(pkg, { recursive: true })
        yield* fs.writeFileString(
          path.join(pkg, "package.json"),
          JSON.stringify({ name: "@opencode/cli", version: "2.2.7", bin: { opencode: "bin/opencode" } }),
        )
        if (npm) {
          yield* fs.makeDirectory(path.join(root, "bin"), { recursive: true })
          yield* fs.writeFileString(path.join(root, "bin", "npm"), "npm")
        }
        return path.join(pkg, "bin", "opencode")
      }),
  )
const npmGlobal = ["lib", "node_modules", "@opencode", "cli"]

// Version managers such as fnm give each Node install its own prefix, while the npm on PATH may belong to another one.
unix("npm runs from the prefix that owns the running binary with that prefix's node first on PATH", () =>
  Effect.gen(function* () {
    const test = yield* installed(npmGlobal, true)
    const npm = path.join(test.prefix, "bin", "npm")
    yield* test.updater.method()
    // Upstream installs here; the fork refuses npm, so only detection and removal reach the package manager.
    const refusedUpgrade = yield* test.updater.upgrade("npm", "2.2.7").pipe(Effect.flip)
    expect(refusedUpgrade.message).toBe(
      "CloseCode publishes no update metadata, so npm cannot install a CloseCode release.",
    )
    const removal = test.updater.removal("npm")
    if (!removal) return yield* Effect.die("Expected npm removal command")
    yield* removal.run
    expect(test.commands[0]).toEqual([npm, "list", "-g", "--depth=0", "--prefix", test.prefix, "@opencode/cli"])
    expect(test.commands.slice(5).map((command) => command.slice(0, 5))).toEqual([
      [npm, "uninstall", "--global", "--prefix", test.prefix],
    ])
    const first = path.join(test.prefix, "bin") + path.delimiter
    expect(test.paths.map((value) => value?.startsWith(first) ?? false)).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
    ])
  }),
)

unix("npm only derives a prefix when the running package is that prefix's global package", () =>
  Effect.gen(function* () {
    const test = yield* installed(["lib", "node_modules", "wrapper", "node_modules", "@opencode", "cli"], true)
    yield* test.updater.method()
    expect(test.commands[0]).toEqual(["npm", "list", "-g", "--depth=0", "@opencode/cli"])
    expect(test.paths[0]).toBeUndefined()
  }),
)

// Upstream verifies the manifest after a package-manager install; the fork refuses the install first, so
// the running copy's manifest is never touched.
it.live("npm upgrades refuse before touching the running copy", () =>
  Effect.gen(function* () {
    const test = yield* installed(npmGlobal)
    const error = yield* test.updater.upgrade("npm", "2.3.4").pipe(Effect.flip)
    expect(error).toBeInstanceOf(Updater.UpgradeError)
    expect(error.message).toBe("CloseCode publishes no update metadata, so npm cannot install a CloseCode release.")
    expect(test.commands).toEqual([])
    const directory = path.dirname(path.dirname(test.executable))
    const text = yield* test.fs.readFileString(path.join(directory, "package.json"))
    expect(JSON.parse(text).version).toBe("2.2.7")
  }),
)

const managers = [
  {
    name: "Volta",
    label: "~/.volta",
    directory: [".volta", "tools", "image", "packages", "@opencode", "cli", ...npmGlobal],
  },
  {
    name: "Volta",
    label: "custom VOLTA_HOME",
    directory: ["volta-home", "tools", "image", "packages", "@opencode", "cli", ...npmGlobal],
  },
  {
    name: "mise",
    label: "mise npm backend",
    directory: ["mise", "installs", "npm-opencode-cli", "2.2.7", ...npmGlobal],
  },
] as const

// Upstream prints `volta install @opencode/cli@<version>` from the release backend it queries; the fork has
// no such backend and must not point at the upstream npm package, so it explains the refusal instead.
managers.forEach((manager) => {
  it.live(`${manager.label} copies report ${manager.name} ownership instead of updating in place`, () =>
    Effect.gen(function* () {
      const test = yield* installed([...manager.directory], true)
      expect(yield* test.updater.method()).toBeUndefined()
      const latest = yield* test.updater.managed()
      const pinned = yield* test.updater.managed("v2.2.6")
      expect(latest?.title).toBe(`CloseCode is managed by ${manager.name}`)
      expect(pinned?.title).toBe(`CloseCode is managed by ${manager.name}`)
      expect(latest?.command).toBeUndefined()
      const applied = yield* test.updater.apply("2.3.4").pipe(Effect.flip)
      expect(applied.message).toContain(`CloseCode is managed by ${manager.name}`)
      // An explicit --method still refuses, and nothing runs against the managed copy.
      const explicit = yield* test.updater.upgrade("npm", "2.3.4").pipe(Effect.flip)
      expect(explicit.message).toBe(
        "CloseCode publishes no update metadata, so npm cannot install a CloseCode release.",
      )
      expect(test.commands).toEqual([])
    }),
  )
})
;[
  ["mise", "installs", "node", "24.22.2"],
  [".volta", "tools", "image", "node", "22.23.4"],
].forEach((node) => {
  it.live(`npm globals under ${node.slice(0, 3).join("/")} stay npm installs`, () =>
    Effect.gen(function* () {
      const test = yield* installed([...node, ...npmGlobal])
      expect(yield* test.updater.managed()).toBeUndefined()
      yield* test.updater.method()
      expect(test.commands).toHaveLength(5)
    }),
  )
})

it.live("version lookups refuse because the fork publishes no release metadata", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    for (const method of [undefined, "npm", "brew", "winget"] as const) {
      const error = yield* test.updater.latest(method).pipe(Effect.flip)
      expect(error.message).toContain("CloseCode publishes no update metadata")
    }
    expect(test.commands).toEqual([])
  }),
)

it.live("manual installs refuse an upstream package manager", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) => ({
      stdout: Buffer.from(command.command === "npm" ? "@opencode/cli@2.3.4" : ""),
    }))
    expect(yield* test.updater.method()).toBe("npm")
    const error = yield* test.updater.apply("2.3.4").pipe(Effect.flip)
    expect(error.message).toBe("CloseCode publishes no update metadata, so npm cannot install a CloseCode release.")
    expect(test.commands).toEqual([
      ["npm", "list", "-g", "--depth=0", ...test.prefixArgs, "@opencode/cli"],
      ["pnpm", "list", "-g", "--depth=0", "@opencode/cli"],
      ["bun", "pm", "ls", "-g"],
      ["yarn", "global", "list"],
      ["vp", "list", "-g", "--json", "@opencode/cli"],
    ])
  }),
)

it.live("update checks report unavailable without running a command", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    // A source checkout cannot check for updates at all; an installed build has no backend to ask.
    expect(yield* test.updater.check()).toEqual({
      type: "unavailable",
      message: expect.stringContaining("runs from a source checkout"),
    })
    expect(test.commands).toEqual([])
  }),
)

const curlInstaller = "https://raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install"

;["success", "download", "install"].forEach((failure) => {
  it.live(`curl uses the CloseCode installer and cleans its directory: ${failure}`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => {
        const installer = command.command === "curl" ? command.args[2] : command.args[0]
        expect(existsSync(path.dirname(installer))).toBe(true)
        return {
          exitCode:
            path.basename(command.command, ".exe") ===
            (failure === "download" ? "curl" : failure === "install" ? "bash" : "")
              ? 1
              : 0,
          stderr: Buffer.from(`${failure} failed`),
        }
      })
      const result = yield* test.updater.upgrade("curl", "v2.3.4-beta.1").pipe(Effect.flip, Effect.option)
      const installer = test.commands[0]?.[3]
      expect(installer).toStartWith(path.join(test.global.cache, "update-"))
      expect(test.commands).toEqual([
        ["curl", "-fsSL", "-o", installer, curlInstaller],
        ...(failure === "download" ? [] : [[test.bash, installer, "--version", "2.3.4-beta.1", "--no-modify-path"]]),
      ])
      expect(yield* test.fs.readDirectory(test.global.cache)).toEqual([])
      expect(result._tag).toBe(failure === "success" ? "None" : "Some")
      if (result._tag === "Some") expect(result.value.message).toBe(`${failure} failed`)
    }),
  )
})

it.live("curl ignores install directory cleanup failures", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "@opencode/cli", true)
    yield* test.updater.upgrade("curl", "v2.3.4-beta.1")
    expect(test.commands.map((command) => command[0])).toEqual(["curl", test.bash])
  }),
)

it.live("invalid version targets never execute a command or create a cache", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    yield* Effect.forEach(Updater.methods, (method) =>
      Effect.forEach(
        ["", "latest", "2.3", "01.2.3", "vv2.3.4", "2.3.4; echo unsafe", "--global", "v2.3.4\n--force"],
        (version) =>
          Effect.gen(function* () {
            const error = yield* test.updater.upgrade(method, version).pipe(Effect.flip)
            expect(error.message).toBe(`Invalid version: ${version}`)
          }),
      ),
    )
    expect(test.commands).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)

;(["npm", "pnpm", "bun", "yarn", "vp", undefined] as const).forEach((method) => {
  it.live(`method detection identifies ${method ?? "an unknown installation"} using the V2 package`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => ({
        stdout: Buffer.from(
          command.command === method
            ? method === "vp"
              ? JSON.stringify([{ name: "@opencode/cli", version: "2.3.4" }])
              : "@opencode/cli@2.3.4"
            : command.command === "vp"
              ? "[]"
              : "opencode-ai@1.0.0",
        ),
      }))
      expect(yield* test.updater.method()).toBe(method)
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", ...test.prefixArgs, "@opencode/cli"],
        ["pnpm", "list", "-g", "--depth=0", "@opencode/cli"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@opencode/cli"],
      ])
    }),
  )
})

it.live("method detection tolerates unavailable package managers", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) =>
      command.command === "yarn"
        ? { stdout: Buffer.from("@opencode/cli@2.3.4") }
        : { error: new AppProcess.AppProcessError({ command: command.command }) },
    )
    expect(yield* test.updater.method()).toBe("yarn")
    expect(test.commands).toHaveLength(5)
  }),
)

it.live("vp detection ignores no-match output that repeats the package name", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) => ({
      stdout: Buffer.from(command.command === "vp" ? "No global packages matching '@opencode/cli'." : ""),
    }))
    expect(yield* test.updater.method()).toBeUndefined()
  }),
)

it.live("Homebrew installs are detected and left to brew for uninstall", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "@opencode/cli", false, "opencode")
    expect(yield* test.updater.method()).toBe("brew")
    expect(test.updater.removal("brew")).toBeUndefined()
    expect(test.commands).toEqual([])
  }),
)

it.live("vp removes the package from its managed global store", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    const removal = test.updater.removal("vp")
    if (!removal) return yield* Effect.die("Expected vp removal command")
    expect(removal.command).toEqual(["vp", "uninstall", "-g", "@opencode/cli"])
    yield* removal.run
    expect(test.commands).toEqual([["vp", "uninstall", "-g", "@opencode/cli"]])
  }),
)

const winget = () =>
  fixture(
    () => ({}),
    "@opencode/cli",
    false,
    undefined,
    (root) =>
      Effect.succeed(
        path.join(
          root,
          "AppData",
          "Local",
          "Microsoft",
          "WinGet",
          "Packages",
          "Anomaly.OpenCode_Microsoft.Winget.Source_8wekyb3d8bbwe",
          "opencode.exe",
        ),
      ),
  )
const wingetArgs = [
  "--id",
  "Anomaly.OpenCode",
  "--exact",
  "--source",
  "winget",
  "--accept-source-agreements",
  "--disable-interactivity",
]

it.live("WinGet installs are detected and removed through WinGet", () =>
  Effect.gen(function* () {
    const test = yield* winget()
    expect(yield* test.updater.method()).toBe("winget")
    const error = yield* test.updater.latest().pipe(Effect.flip)
    expect(error.message).toContain("CloseCode publishes no update metadata")
    const removal = test.updater.removal("winget")
    if (!removal) return yield* Effect.die("Expected winget removal command")
    yield* removal.run
    expect(test.commands).toEqual([["winget", "uninstall", ...wingetArgs]])
  }),
)

// Links are named opencode-upgrade-<pid>-<random>.exe; read them from inside the installer run.
const links = (directory: string) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("opencode-")) : []
const upgradeLinks = (directory: string) =>
  links(directory).filter((name) => name.startsWith(`opencode-upgrade-${process.pid}-`))

windows("windows keeps the uninstall link in the temporary directory, not the removed cache", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(upgradeLinks(layout.tmp)).toHaveLength(1)
      return {}
    })
    layout.tmp = test.global.tmp
    yield* test.fs.makeDirectory(test.global.cache, { recursive: true })
    const removal = test.updater.removal("bun")
    if (!removal) return yield* Effect.die("Expected bun removal command")
    yield* removal.run
    expect(test.commands).toEqual([["bun", "remove", "--global", "@opencode/cli"]])
    expect(links(test.global.cache)).toEqual([])
    expect(links(test.global.tmp)).toEqual([])
  }),
)

windows("windows links the curl binary before the installer replaces it", () =>
  Effect.gen(function* () {
    const layout = { executable: "", cache: "" }
    const test = yield* fixture(
      (command) => {
        if (path.basename(command.command, ".exe") === "bash") {
          expect(readFileSync(layout.executable, "utf8")).toBe("binary")
          expect(upgradeLinks(layout.cache)).toHaveLength(1)
        }
        return {}
      },
      "@opencode/cli",
      false,
      undefined,
      (_root, home) => Effect.succeed(path.join(home, ".opencode", "bin", "opencode.exe")),
    )
    layout.executable = test.executable
    layout.cache = test.global.cache
    const original = process.execPath
    process.execPath = layout.executable
    yield* Effect.addFinalizer(() => Effect.sync(() => (process.execPath = original)))
    expect(yield* test.updater.method()).toBe("curl")
    yield* test.updater.upgrade("curl", "2.3.4")
    expect(test.commands.map((command) => command[0])).toEqual(["curl", test.bash])
    expect(yield* test.fs.readFileString(layout.executable)).toBe("binary")
    expect(links(test.global.cache)).toEqual([])
  }),
)

unix("curl method detection resolves symlinked home directories", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@opencode/cli",
      false,
      undefined,
      (root, home) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const realHome = path.join(root, "real-home")
          const bin = path.join(realHome, ".opencode", "bin", "opencode")
          yield* fs.makeDirectory(path.dirname(bin), { recursive: true })
          yield* fs.symlink(realHome, home)
          return bin
        }),
    )
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.commands).toEqual([])
  }),
)

windows("windows leaves a runtime the installer does not own untouched", () =>
  Effect.gen(function* () {
    const layout = { cache: "" }
    const test = yield* fixture(() => {
      expect(links(layout.cache)).toEqual([])
      return {}
    })
    layout.cache = test.global.cache
    yield* test.updater.upgrade("curl", "2.3.4")
    expect(test.commands.map((command) => command[0])).toEqual(["curl", test.bash])
  }),
)

unix("other platforms never link the running binary", () =>
  Effect.gen(function* () {
    const layout = { cache: "" }
    const test = yield* fixture(() => {
      expect(links(layout.cache)).toEqual([])
      return {}
    })
    layout.cache = test.global.cache
    yield* test.updater.upgrade("curl", "2.3.4")
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
  }),
)

test("Node distribution honors the compile-time CLI name", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      import.meta.path,
      "--define",
      'OPENCODE_CLI_NAME="closecode-node"',
      "--test-name-pattern",
      "^Node distribution resolves the published npm package$",
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "ignore",
      stderr: "pipe",
      // Bun 1.4 can reuse cached modules compiled with different --define values.
      env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    },
  )
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect(code, stderr).toBe(0)
  expect(stderr).toContain("1 pass")
})

if (typeof OPENCODE_CLI_NAME === "string" && OPENCODE_CLI_NAME === "closecode-node") {
  it.live("Node distribution resolves the published npm package", () =>
    Effect.gen(function* () {
      const test = yield* fixture(
        (command) => ({
          stdout: Buffer.from(command.command === "npm" ? "@opencode/cli-node@2.3.4" : ""),
        }),
        "@opencode/cli-node",
      )
      expect(yield* test.updater.method()).toBe("npm")
      const error = yield* test.updater.upgrade("npm", "v2.3.4").pipe(Effect.flip)
      expect(error.message).toBe("CloseCode publishes no update metadata, so npm cannot install a CloseCode release.")
      // Upstream runs the npm/pnpm/vp installs here; the fork refuses each with the resolved node package name.
      const pnpm = yield* test.updater.upgrade("pnpm", "v2.3.4").pipe(Effect.flip)
      const vp = yield* test.updater.upgrade("vp", "v2.3.4").pipe(Effect.flip)
      expect(pnpm.message).toBe("CloseCode publishes no update metadata, so pnpm cannot install a CloseCode release.")
      expect(vp.message).toBe("CloseCode publishes no update metadata, so vp cannot install a CloseCode release.")
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", ...test.prefixArgs, "@opencode/cli-node"],
        ["pnpm", "list", "-g", "--depth=0", "@opencode/cli-node"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@opencode/cli-node"],
      ])
    }),
  )
}
