import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { EffectFlock } from "@opencode/util/effect-flock"
import { OPENCODE_CHANNEL, OPENCODE_LOCAL, OPENCODE_VERSION } from "../version"
import { Context, Duration, Effect, FileSystem, Layer, Option, Ref, Schema } from "effect"
import { ChildProcess } from "effect/process"
import { parse, type ParseError } from "jsonc-parser"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { RetainedImage } from "./retained-image"
import { action, parseReleaseVersion, type Policy } from "./updater-action"
import { errorMessage } from "../util/error"

export const methods = ["curl", "npm", "pnpm", "bun", "yarn", "vp", "brew", "winget"] as const

export type Method = (typeof methods)[number]
export type RunResult = { readonly type: "available" | "installed"; readonly version: string }
export type CheckResult = RunResult | { readonly type: "unavailable"; readonly message: string }

export class UpgradeError extends Error {
  readonly title: string
  readonly detail: string
  readonly command?: string
  readonly retry: string

  constructor(
    input: {
      readonly title: string
      readonly detail: string
      readonly command?: string
      readonly retry: string
    },
    options?: ErrorOptions,
  ) {
    super(input.detail, options)
    this.name = "UpgradeError"
    this.title = input.title
    this.detail = input.detail
    this.command = input.command
    this.retry = input.retry
  }
}

const decodeVpPackages = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String }))),
)

const installNames: Record<Method, string> = {
  curl: "The CloseCode installer",
  npm: "npm",
  pnpm: "pnpm",
  bun: "Bun",
  yarn: "Yarn",
  vp: "Vite+",
  brew: "Homebrew",
  winget: "WinGet",
}

const wingetPackage = "Anomaly.OpenCode"
const wingetArgs = [
  "--id",
  wingetPackage,
  "--exact",
  "--source",
  "winget",
  "--accept-source-agreements",
  "--disable-interactivity",
]

// The fork publishes no update metadata, npm package, Homebrew formula, or WinGet package: every
// install method other than the fork installer would fetch the upstream OpenCode build, so lookups and
// those upgrades refuse instead of replacing CloseCode with upstream.
const noUpdateBackendMessage =
  "CloseCode has no update backend. Reinstall from https://github.com/reubenzhuyt-cloud/CloseCode/releases or run script/install-closecode.ps1, or upgrade to a known release with `closecode upgrade <version> --method curl`."

function noUpdateBackend(method?: Method) {
  return new UpgradeError({
    title: "CloseCode has no update backend",
    detail:
      method === undefined
        ? "CloseCode publishes no update metadata, so it cannot choose a version to install."
        : `CloseCode publishes no update metadata, so ${method} cannot install a CloseCode release.`,
    retry: noUpdateBackendMessage,
  })
}

function conciseDetail(input: string) {
  const lines = stripVTControlCharacters(input)
    .trim()
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  const tail = lines.slice(-12).join("\n")
  const clipped = tail.length > 2_000
  const detail = clipped ? `…${tail.slice(-1_999)}` : tail
  if (!detail) return
  if (lines.length <= 12 && !clipped) return detail
  return `${detail}\n\nOutput shortened to the last 12 lines.`
}

function errorDetail(cause: unknown): string {
  if (cause instanceof AppProcess.AppProcessError) {
    const stderr = conciseDetail(cause.stderr ?? "")
    if (stderr) return stderr
    if (cause.cause !== undefined) return errorDetail(cause.cause)
    return cause.message
  }
  if (cause instanceof Error) {
    const detail = cause.cause === undefined ? undefined : errorDetail(cause.cause)
    if (!detail || detail === cause.message) return cause.message
    return `${cause.message}: ${detail}`
  }
  return errorMessage(cause)
}

function resultDetail(result: { code: number; stdout: string; stderr: string }) {
  return (
    conciseDetail(result.stderr) ??
    conciseDetail(result.stdout) ??
    `The command exited with code ${result.code} without any error output.`
  )
}

export interface Interface {
  readonly run: (onInstall?: (version: string) => void) => Effect.Effect<RunResult | undefined>
  readonly check: () => Effect.Effect<CheckResult | undefined, Error>
  readonly apply: (version: string) => Effect.Effect<void, Error>
  readonly method: () => Effect.Effect<Method | undefined>
  /** Explains why a copy that Volta or mise manages cannot be updated in place; `method` leaves it undetected. */
  readonly managed: (version?: string) => Effect.Effect<UpgradeError | undefined, Error>
  readonly latest: (method?: Method) => Effect.Effect<string, Error>
  readonly upgrade: (method: Method, version: string) => Effect.Effect<void, Error>
  readonly removal: (
    method: Method,
  ) => { readonly command: ReadonlyArray<string>; readonly run: Effect.Effect<void, Error> } | undefined
}

export class Service extends Context.Service<Service, Interface>()("@opencode/cli/Updater") {}

export function decodePolicy(text: string): Policy | undefined {
  // The CLI only projects this host-level preference instead of initializing
  // the location-scoped server configuration graph.
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null) return
  if ("update" in input) {
    const value = input.update
    if (value === "disable" || value === "notify" || value === "auto") return value
    return
  }
  if (!("autoupdate" in input)) return
  if (input.autoupdate === false) return "disable"
  if (input.autoupdate === "notify") return "notify"
  if (input.autoupdate === true) return "auto"
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const appProcess = yield* AppProcess.Service
  const flock = yield* EffectFlock.Service
  const installedVersion = yield* Ref.make(OPENCODE_VERSION)
  const executable = yield* fs.realPath(process.execPath).pipe(Effect.orElseSucceed(() => process.execPath))
  const installedPackage = yield* Effect.gen(function* () {
    const directory = path.dirname(path.dirname(executable))
    const manifest: { name: string; bin?: Record<string, string> } = yield* fs
      .readFileString(path.join(directory, "package.json"))
      .pipe(Effect.flatMap((text) => Effect.try(() => JSON.parse(text))))
    // Source invocations run inside Bun or Node, which may themselves be npm packages.
    if (!/^@opencode(?:-ai)?\/cli(?:-node)?$/.test(manifest.name)) return
    if (Object.values(manifest.bin ?? {}).some((bin) => path.resolve(directory, bin) === executable))
      return manifest.name
  }).pipe(Effect.orElseSucceed(() => undefined))
  // "opencode" is Homebrew Core's formula; the others are published to anomalyco/tap.
  const installedFormula = ["opencode", "opencode-beta", "opencode-v2"].find((name) =>
    executable.includes(`${path.sep}Cellar${path.sep}${name}${path.sep}`),
  )
  // WinGet extracts portable packages into a directory named after the package identifier.
  const installedWinget = /[\\/]winget[\\/]packages[\\/]anomaly\.opencode_/i.test(executable)
  // Volta packages (tools/image/packages) and mise's npm backend (installs/npm-<name>) keep their own record of the
  // installed version, so updating the copy in place would leave it stale. npm globals under a Volta or mise Node
  // (tools/image/node, installs/node) are ordinary npm installs.
  const installedOwner = !installedPackage
    ? undefined
    : /[\\/]tools[\\/]image[\\/]packages[\\/]/.test(executable)
      ? { name: "Volta" }
      : /[\\/]installs[\\/]npm-[^\\/]+[\\/]/.test(executable)
        ? { name: "mise" }
        : undefined
  // npm keeps global packages in <prefix>/lib/node_modules on POSIX. The npm on PATH may belong to another Node
  // install (fnm, nvm, mise) or prefix, so target the prefix that owns the running binary. Windows uses
  // <prefix>\node_modules, which Bun and pnpm global installs share, so it keeps the npm on PATH.
  const packageDirectory = path.dirname(path.dirname(executable))
  const npmPackageDirectory = installedPackage ? path.join("/lib/node_modules", installedPackage) : undefined
  const npmPrefix =
    npmPackageDirectory &&
    !installedOwner &&
    process.platform !== "win32" &&
    packageDirectory.endsWith(npmPackageDirectory)
      ? packageDirectory.slice(0, -npmPackageDirectory.length) || undefined
      : undefined
  const npmPrefixArgs = npmPrefix ? ["--prefix", npmPrefix] : []
  const npmBin = npmPrefix ? path.join(npmPrefix, "bin") : undefined
  const prefixNpm =
    npmBin && (yield* fs.exists(path.join(npmBin, "npm")).pipe(Effect.orElseSucceed(() => false)))
      ? path.join(npmBin, "npm")
      : undefined
  const npm = prefixNpm ?? "npm"

  const readPolicy = Effect.fnUntraced(function* () {
    const values = yield* Effect.forEach(["config.json", "opencode.json", "opencode.jsonc"], (name) =>
      fs.readFileString(path.join(global.config, name)).pipe(
        Effect.map(decodePolicy),
        Effect.orElseSucceed(() => undefined),
      ),
    )
    return values.findLast((value) => value !== undefined) ?? "notify"
  })

  const exec = Effect.fnUntraced(function* (command: string[], timeout: Duration.Input = "30 seconds") {
    // The prefix's npm and the package's postinstall run `node` from PATH, which may be missing or belong to another
    // Node install, so put the prefix's own node first.
    const options =
      command[0] === prefixNpm
        ? { env: { PATH: [npmBin, process.env.PATH].filter(Boolean).join(path.delimiter) }, extendEnv: true }
        : undefined
    return yield* appProcess
      .run(ChildProcess.make(command[0], command.slice(1), options), {
        timeout,
        maxOutputBytes: 100_000,
        maxErrorBytes: 100_000,
      })
      .pipe(
        Effect.map((result) => ({
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        })),
      )
  })

  const extension = process.platform === "win32" ? ".exe" : ""
  const curlBinaries = yield* Effect.forEach(
    ["closecode", "opencode"].map((name) => path.resolve(global.home, ".opencode", "bin", `${name}${extension}`)),
    (candidate) => fs.realPath(candidate).pipe(Effect.orElseSucceed(() => candidate)),
  )

  // On Windows a bare `bash` may be the WSL launcher, which cannot run the installer against Windows paths.
  const installerBash = Effect.fnUntraced(function* () {
    if (process.platform !== "win32") return "bash"
    if (process.env.OPENCODE_GIT_BASH_PATH) return process.env.OPENCODE_GIT_BASH_PATH
    const git = yield* exec(["git", "--exec-path"]).pipe(Effect.orElseSucceed(() => undefined))
    const bash = git?.code === 0 ? path.resolve(git.stdout.trim(), "..", "..", "..", "bin", "bash.exe") : undefined
    if (bash && (yield* fs.exists(bash).pipe(Effect.orElseSucceed(() => false)))) return bash
    return yield* Effect.fail(
      new UpgradeError({
        title: "Git Bash is required to update CloseCode",
        detail: "The CloseCode installer runs with Git Bash on Windows, and it was not found.",
        retry: "Install Git for Windows or set OPENCODE_GIT_BASH_PATH, then run closecode upgrade again.",
      }),
    )
  })

  const method = Effect.fnUntraced(function* () {
    if (curlBinaries.includes(executable)) return "curl"
    if (installedFormula) return "brew"
    if (installedWinget) return "winget"
    if (!installedPackage || installedOwner) return

    const parts = executable.toLowerCase().split(path.sep).map((part) => part.replace(/^\./, ""))
    const checks: Array<{ method: Method; command: string[] }> = [
      { method: "npm", command: [npm, "list", "-g", "--depth=0", ...npmPrefixArgs, installedPackage] },
      { method: "pnpm", command: ["pnpm", "list", "-g", "--depth=0", installedPackage] },
      { method: "bun", command: ["bun", "pm", "ls", "-g"] },
      { method: "yarn", command: ["yarn", "global", "list"] },
      { method: "vp", command: ["vp", "list", "-g", "--json", installedPackage] },
    ]
    checks.sort((a, b) => Number(parts.includes(b.method)) - Number(parts.includes(a.method)))
    const results = yield* Effect.forEach(
      checks,
      (check) =>
        exec(check.command).pipe(
          Effect.orElseSucceed(() => ({ code: 1, stdout: "", stderr: "" })),
          Effect.map((result) => ({ check, result })),
        ),
      { concurrency: "unbounded" },
    )
    return results.find((result) => {
      if (result.check.method !== "vp") return result.result.stdout.includes(installedPackage)
      // Vite+ repeats the filter in its successful no-match message, so substring detection would be a false positive.
      return Option.exists(decodeVpPackages(result.result.stdout), (packages) =>
        packages.some((item) => item.name === installedPackage),
      )
    })?.check.method
  })

  const removalCommand = (method: Method) => {
    if (method === "winget") return ["winget", "uninstall", ...wingetArgs]
    if (method === "curl" || method === "brew" || !installedPackage) return undefined
    const commands = {
      npm: [npm, "uninstall", "--global", ...npmPrefixArgs, installedPackage],
      pnpm: ["pnpm", "remove", "--global", installedPackage],
      bun: ["bun", "remove", "--global", installedPackage],
      yarn: ["yarn", "global", "remove", installedPackage],
      vp: ["vp", "uninstall", "-g", installedPackage],
    }
    return commands[method]
  }

  const removal = (method: Method) => {
    const command = removalCommand(method)
    if (!command) return undefined
    return {
      command,
      run: retaining(
        method,
        exec(command, "5 minutes").pipe(
          Effect.flatMap((result) => (result.code === 0 ? Effect.void : Effect.fail(new Error(resultDetail(result))))),
        ),
        global.tmp,
      ),
    }
  }

  // No service describes a CloseCode release, so a version lookup always refuses rather than
  // resolving an upstream OpenCode version to install.
  const latest = (method?: Method) => Effect.fail(noUpdateBackend(method))

  // Volta and mise keep their own record of the installed version, so a copy they manage cannot be
  // updated in place; say so instead of pointing at an upstream npm release the fork does not publish.
  const managedError = (owner: { name: string }) =>
    new UpgradeError({
      title: `CloseCode is managed by ${owner.name}`,
      detail: `This copy was installed with ${owner.name}, which keeps its own record of the installed version, so CloseCode won't update it directly.`,
      retry:
        "Update it with the tool that installed it, or reinstall from https://github.com/reubenzhuyt-cloud/CloseCode/releases.",
    })

  const managedMessage = (error: UpgradeError) => `${error.title}. ${error.retry}`

  const managed = Effect.fnUntraced(function* (input?: string) {
    if (!installedOwner) return
    if (input !== undefined && !parseReleaseVersion(input))
      return yield* Effect.fail(new Error(`Invalid version: ${input}`))
    return managedError(installedOwner)
  })

  const temporaryDirectory = (prefix: string) =>
    Effect.acquireRelease(fs.makeTempDirectory({ directory: global.cache, prefix }), (directory) =>
      fs.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
    )

  // On Windows the installer must delete or replace the running binary, which only works
  // while another link to it exists (see RetainedImage). Upgrades keep that link in the
  // cache; uninstall has already removed the cache, so it uses the temporary directory.
  const retaining = <A, E, R>(method: Method, effect: Effect.Effect<A, E, R>, directory = global.cache) => {
    if (process.platform !== "win32" || method === "brew") return effect
    // Only the installed binary is at stake; source checkouts run inside bun or node.
    const owned =
      method === "curl"
        ? curlBinaries.includes(executable)
        : method === "winget"
          ? installedWinget
          : installedPackage !== undefined
    if (!owned) return effect
    return Effect.scoped(RetainedImage.retain(directory, "upgrade").pipe(Effect.andThen(effect))).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
    )
  }

  const runUpgrade = (input: {
    readonly method: Method
    readonly command: string[]
    readonly displayCommand?: string[]
    readonly title?: string
    readonly retry?: string
  }) => {
    const failure = (detail: string, cause?: unknown) =>
      new UpgradeError(
        {
          title: input.title ?? `${installNames[input.method]} could not install CloseCode`,
          detail,
          command: (input.displayCommand ?? input.command).join(" "),
          retry: input.retry ?? "Fix the issue above, then run closecode upgrade again.",
        },
        cause === undefined ? undefined : { cause },
      )
    return exec(input.command, "5 minutes").pipe(
      Effect.flatMap((result) =>
        result.code === 0 ? Effect.succeed(result) : Effect.fail(failure(resultDetail(result))),
      ),
      Effect.mapError((cause) =>
        cause instanceof UpgradeError
          ? cause
          : failure(
              cause instanceof AppProcess.AppProcessError && cause.stderr === undefined && cause.cause === undefined
                ? `Failed to update with ${input.method}`
                : errorDetail(cause),
              cause,
            ),
      ),
    )
  }

  const upgrade = Effect.fnUntraced(function* (method: Method, input: string) {
    if (!parseReleaseVersion(input)) return yield* Effect.fail(new Error(`Invalid version: ${input}`))
    // The fork installer is the only path that installs a CloseCode build: every package manager and
    // WinGet method resolves an upstream OpenCode package, so they refuse instead of upgrading to it.
    if (method !== "curl") return yield* Effect.fail(noUpdateBackend(method))
    const version = input.trim().replace(/^v/, "")
    yield* Effect.scoped(
      Effect.gen(function* () {
        // Other OpenCode processes may be installing at the same time. The installer runs two
        // 5-minute commands, so wait longer than both.
        yield* flock.acquire("cli-upgrade", undefined, { timeoutMs: Duration.toMillis("15 minutes") })
        const bash = yield* installerBash()
        yield* fs.makeDirectory(global.cache, { recursive: true })
        const directory = yield* temporaryDirectory("update-")
        const installer = path.join(directory, "install")
        yield* runUpgrade({
          method,
          command: [
            "curl",
            "-fsSL",
            "-o",
            installer,
            "https://raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install",
          ],
          displayCommand: [
            "curl",
            "-fsSL",
            "https://raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install",
          ],
          title: "Could not download the CloseCode installer",
          retry: "Check your network, then run closecode upgrade again.",
        })
        return yield* retaining(
          method,
          runUpgrade({
            method,
            command: [bash, installer, "--version", version, "--no-modify-path"],
            displayCommand: ["closecode", "upgrade", version, "--method", "curl"],
            title: "The CloseCode installer failed",
          }),
        )
      }),
    ).pipe(
      Effect.mapError((cause) =>
        cause instanceof UpgradeError
          ? cause
          : new UpgradeError(
              {
                title: "Could not prepare the CloseCode upgrade",
                detail: errorDetail(cause),
                retry: "Fix the issue above, then run closecode upgrade again.",
              },
              { cause },
            ),
      ),
      Effect.asVoid,
    )
  })

  const inspect = Effect.fnUntraced(function* () {
    // The fork has no update backend, so self-update is disabled by default.
    // An explicit OPENCODE_DISABLE_AUTOUPDATE=0/false opts back in.
    const autoupdate = process.env.OPENCODE_DISABLE_AUTOUPDATE?.toLowerCase()
    const autoupdateDisabled =
      autoupdate === undefined || autoupdate === "" || autoupdate === "1" || autoupdate === "true"
    if (OPENCODE_LOCAL || autoupdateDisabled) {
      yield* Effect.logInfo("update check skipped", {
        reason: OPENCODE_LOCAL ? "local-install" : "disabled",
        version: OPENCODE_VERSION,
        channel: OPENCODE_CHANNEL,
      })
      return undefined
    }
    const policy = yield* readPolicy()
    if (policy === "disable") {
      yield* Effect.logInfo("update check skipped", { reason: "policy-disabled" })
      return undefined
    }

    const current = yield* Ref.get(installedVersion)
    const version = yield* latest()
    yield* Effect.logInfo("update check", {
      current,
      latest: version,
    })
    const next = action(current, version, policy)
    if (next === "none") {
      yield* Effect.logInfo("update check done", { action: "up-to-date" })
      return undefined
    }
    yield* Effect.logInfo("CloseCode update available", { current, latest: version, action: next })
    return { policy, version }
  })

  const install = Effect.fnUntraced(function* (version: string) {
    const detected = yield* method()
    if (!detected) {
      yield* Effect.logWarning("update skipped: installation method not found")
      return false
    }
    const current = yield* Ref.get(installedVersion)
    yield* upgrade(detected, version)
    yield* Ref.set(installedVersion, version)
    yield* Effect.logInfo("updated CloseCode", { from: current, to: version, method: detected })
    return true
  })

  const apply = Effect.fn("cli.updater.apply")(function* (version: string) {
    if (yield* install(version)) return
    const error = yield* managed(version)
    return yield* Effect.fail(
      new Error(
        error
          ? managedMessage(error)
          : "Could not detect the installation method. Update with your package manager or download the latest release.",
      ),
    )
  })

  const check = Effect.fn("cli.updater.check")(function* () {
    if (OPENCODE_LOCAL)
      return {
        type: "unavailable" as const,
        message: "This build runs from a source checkout. Use an installed CloseCode release to check for updates.",
      }
    // Nothing publishes CloseCode versions, so there is no release to compare the running build with. A
    // copy that Volta or mise manages still says why it cannot update in place.
    return {
      type: "unavailable" as const,
      message: installedOwner ? managedMessage(managedError(installedOwner)) : noUpdateBackendMessage,
    }
  })

  const run = Effect.fn("cli.updater.run")(
    function* (onInstall: (version: string) => void = () => {}) {
      const result = yield* inspect()
      if (!result) return undefined
      if (result.policy === "notify") return { type: "available" as const, version: result.version }
      onInstall(result.version)
      if (!(yield* install(result.version))) return yield* Effect.fail(new Error("Installation method not found"))
      return { type: "installed" as const, version: result.version }
    },
    Effect.catch((error) => Effect.logWarning("update check failed", { error }).pipe(Effect.as(undefined))),
  )

  return Service.of({ run, check, apply, method, managed, latest, upgrade, removal })
})

export const layer = Layer.effect(Service, make)

export * as Updater from "./updater"
export { action, type Action, type Policy } from "./updater-action"
