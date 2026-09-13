/** @jsxImportSource @opentui/solid */
import { TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onCleanup, onMount } from "solid-js"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createEventSource, createFetch, directory, json, type FetchHandler } from "../fixture/tui-sdk"
import { ArgsProvider } from "../../src/context/args"
import { KVProvider } from "../../src/context/kv"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { ExitProvider } from "../../src/context/exit"
import { SyncProvider, useSync } from "../../src/context/sync"
import { SDKProvider } from "../../src/context/sdk"
import { RouteProvider } from "../../src/context/route"
import { LocalProvider } from "../../src/context/local"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { ToastProvider } from "../../src/ui/toast"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { DialogAgentManage } from "../../src/component/dialog-agent-manage"

async function wait(fn: () => boolean, label = "condition", timeout = 3000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`)
    await Bun.sleep(10)
  }
}

async function mountManage() {
  const tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const requests: { method: string; path: string; body: string }[] = []
  const build = { name: "build", mode: "primary", prompt: "You are build.", permission: [], options: {} }
  const plan = { name: "plan", mode: "primary", native: true, permission: [], options: {} }
  const triage = { name: "triage", mode: "primary", hidden: true, permission: [], options: {} }
  const compaction = { name: "compaction", mode: "primary", native: true, hidden: true, permission: [], options: {} }
  const override: FetchHandler = (url) => {
    if (url.pathname === "/agent") return json([build, plan, triage, compaction])
    if (url.pathname === "/config") return json({ agent: { build: { description: "hello" } } })
    if (url.pathname === "/experimental/tool/ids") return json(["bash", "read"])
    return undefined
  }
  const base = createFetch(override)
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({ method: request.method, path: new URL(request.url).pathname, body: await request.clone().text() })
    return base.fetch(request)
  }) as typeof globalThis.fetch

  const events = createEventSource()
  const warnings: string[] = []
  const onWarning = (warning: Error) => {
    if (warning.name === "MaxListenersExceededWarning") warnings.push(warning.message)
  }
  process.on("warning", onWarning)

  let keymap!: ReturnType<typeof createDefaultOpenTuiKeymap>
  let sync!: ReturnType<typeof useSync>
  let dialog!: ReturnType<typeof useDialog>
  let ready!: () => void
  const isReady = new Promise<void>((resolve) => (ready = resolve))

  function Root() {
    dialog.replace(() => <DialogAgentManage />)
    return <box />
  }

  function Probe() {
    sync = useSync()
    dialog = useDialog()
    onMount(() => ready())
    return <box />
  }

  function Harness() {
    const renderer = useRenderer()
    keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)
    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <ArgsProvider>
          <KVProvider>
            <SDKProvider url="http://test" directory={directory} fetch={fetch} events={events.source}>
              <PermissionProvider>
                <ProjectProvider>
                  <ExitProvider exit={() => {}}>
                    <SyncProvider>
                      <OpencodeKeymapProvider keymap={keymap}>
                        <TuiConfigProvider config={resolvedConfig}>
                          <ThemeProvider mode="dark">
                            <RouteProvider>
                              <ToastProvider>
                                <LocalProvider>
                                  <DialogProvider>
                                    <Probe />
                                    <Root />
                                  </DialogProvider>
                                </LocalProvider>
                              </ToastProvider>
                            </RouteProvider>
                          </ThemeProvider>
                        </TuiConfigProvider>
                      </OpencodeKeymapProvider>
                    </SyncProvider>
                  </ExitProvider>
                </ProjectProvider>
              </PermissionProvider>
            </SDKProvider>
          </KVProvider>
        </ArgsProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  await isReady
  await wait(() => sync.status === "complete", "sync complete")
  await wait(
    () =>
      keymap.getCommandBindings({ visibility: "active", commands: ["dialog.select.submit"] }).get("dialog.select.submit")!
        .length === 1,
    "manage select submit active",
  )
  await Bun.sleep(30)

  return {
    app,
    requests,
    warnings,
    dialog: () => dialog,
    async cleanup() {
      process.off("warning", onWarning)
      app.renderer.destroy()
      await tmp[Symbol.asyncDispose]()
    },
  }
}

async function settle() {
  await Bun.sleep(40)
}

test("agent manage -> edit -> description/toolset/permission -> save", async () => {
  const harness = await mountManage()
  try {
    const { app, requests, dialog } = harness

    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()
    await settle()

    await wait(() => dialog().stack.length === 1, "edit open")
    app.mockInput.pressEnter()
    await settle()
    await wait(() => app.renderer.currentFocusedEditor instanceof TextareaRenderable, "description textarea")
    const textarea = app.renderer.currentFocusedEditor
    if (!(textarea instanceof TextareaRenderable)) throw new Error("expected description textarea")
    expect(textarea.plainText).toBe("hello")

    await app.mockInput.typeText("!")
    app.mockInput.pressEnter()
    await settle()

    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()
    await settle()
    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()
    await settle()
    app.mockInput.pressArrow("up")
    await settle()
    app.mockInput.pressEnter()
    await settle()

    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()
    await settle()
    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()
    await settle()
    app.mockInput.pressArrow("up")
    await settle()
    app.mockInput.pressEnter()
    await settle()

    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    app.mockInput.pressArrow("down")
    await settle()
    app.mockInput.pressEnter()

    await wait(() => dialog().stack.length === 0, "save closes dialog")

    const patch = requests.find((request) => request.method === "PATCH" && request.path === "/config")
    expect(patch).toBeDefined()
    expect(JSON.parse(patch!.body)).toEqual({
      agent: {
        build: {
          description: "hello!",
          toolset: { "*": false, bash: true },
          permission: { bash: "deny" },
        },
      },
    })
    expect(harness.warnings).toEqual([])
  } finally {
    await harness.cleanup()
  }
})

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  return app.captureCharFrame()
}

function pressDowns(app: Awaited<ReturnType<typeof testRender>>, count: number) {
  for (let index = 0; index < count; index++) app.mockInput.pressArrow("down")
}

async function openBuildEdit(harness: Awaited<ReturnType<typeof mountManage>>) {
  harness.app.mockInput.pressArrow("down")
  await settle()
  harness.app.mockInput.pressEnter()
  await settle()
  await wait(() => harness.dialog().stack.length === 1, "edit open")
}

async function openPromptView(harness: Awaited<ReturnType<typeof mountManage>>) {
  await openBuildEdit(harness)
  harness.app.mockInput.pressArrow("down")
  await settle()
  harness.app.mockInput.pressEnter()
  await settle()
  await wait(
    () => harness.app.renderer.currentFocusedEditor instanceof TextareaRenderable,
    "prompt textarea",
  )
}

function focusedTextarea(app: Awaited<ReturnType<typeof testRender>>) {
  const textarea = app.renderer.currentFocusedEditor
  if (!(textarea instanceof TextareaRenderable)) throw new Error("expected prompt textarea")
  return textarea
}

test("agent manage groups system agents and escapes back", async () => {
  const harness = await mountManage()
  try {
    const { app, dialog } = harness
    pressDowns(app, 2)
    await settle()
    app.mockInput.pressEnter()
    await settle()

    const system = await capture(app)
    expect(system).toContain("plan")
    expect(system).toContain("compaction")
    expect(system).toContain("← Back")

    app.mockInput.pressEscape()
    await settle()
    const agents = await capture(app)
    expect(agents).toContain("System agents (2)")
    expect(agents).toContain("plan")
    expect(agents).not.toContain("← Back")

    app.mockInput.pressEscape()
    await settle()
    expect(dialog().stack.length).toBe(0)
  } finally {
    await harness.cleanup()
  }
})

test("agent manage groups hidden agents and returns to the main list", async () => {
  const harness = await mountManage()
  try {
    const { app, dialog } = harness
    const agents = await capture(app)
    expect(agents).toContain("Hidden (1)")
    expect(agents).not.toContain("triage")

    pressDowns(app, 3)
    await settle()
    app.mockInput.pressEnter()
    await settle()

    const hidden = await capture(app)
    expect(hidden).toContain("triage")
    expect(hidden).not.toContain("compaction")
    expect(hidden).toContain("← Back")

    app.mockInput.pressEscape()
    await settle()
    expect(dialog().stack.length).toBe(1)
    const back = await capture(app)
    expect(back).toContain("Hidden (1)")
    expect(back).not.toContain("← Back")
  } finally {
    await harness.cleanup()
  }
})

test("agent prompt saves with alt+return", async () => {
  const harness = await mountManage()
  try {
    const { app, requests, dialog } = harness
    await openPromptView(harness)
    const textarea = focusedTextarea(app)
    expect(textarea.plainText).toBe("You are build.")

    await app.mockInput.typeText("!")
    app.mockInput.pressEnter({ meta: true })
    await settle()

    pressDowns(app, 6)
    await settle()
    app.mockInput.pressEnter()
    await wait(() => dialog().stack.length === 0, "save closes dialog")

    const patch = requests.find((request) => request.method === "PATCH" && request.path === "/config")
    expect(patch).toBeDefined()
    expect(JSON.parse(patch!.body).agent.build.prompt).toBe("You are build.!")
  } finally {
    await harness.cleanup()
  }
})

test("agent prompt confirm keeps or discards edits", async () => {
  const harness = await mountManage()
  try {
    const { app, requests, dialog } = harness
    await openPromptView(harness)
    await app.mockInput.typeText("!")
    app.mockInput.pressEscape()
    await settle()
    expect(await capture(app)).toContain("Save prompt changes?")

    pressDowns(app, 2)
    await settle()
    app.mockInput.pressEnter()
    await settle()
    expect(focusedTextarea(app).plainText.endsWith("!")).toBe(true)

    app.mockInput.pressEscape()
    await settle()
    expect(await capture(app)).toContain("Save prompt changes?")

    pressDowns(app, 1)
    await settle()
    app.mockInput.pressEnter()
    await settle()

    pressDowns(app, 6)
    await settle()
    app.mockInput.pressEnter()
    await wait(() => dialog().stack.length === 0, "save closes dialog")

    const patch = requests.find((request) => request.method === "PATCH" && request.path === "/config")
    expect(patch).toBeDefined()
    expect("prompt" in JSON.parse(patch!.body).agent.build).toBe(false)
  } finally {
    await harness.cleanup()
  }
})

test("escape from edit fields returns to the agents list", async () => {
  const harness = await mountManage()
  try {
    const { app, dialog } = harness
    await openBuildEdit(harness)

    app.mockInput.pressEscape()
    await settle()
    expect(dialog().stack.length).toBe(1)
    expect(await capture(app)).toContain("System agents (2)")

    app.mockInput.pressEscape()
    await settle()
    expect(dialog().stack.length).toBe(0)
  } finally {
    await harness.cleanup()
  }
})

test("plain return inserts a newline in the prompt editor", async () => {
  const harness = await mountManage()
  try {
    const { app, requests } = harness
    await openPromptView(harness)
    const textarea = focusedTextarea(app)
    const before = textarea.plainText

    app.mockInput.pressEnter()
    await settle()

    expect(textarea.plainText.length).toBe(before.length + 1)
    expect(textarea.plainText).toContain("\n")
    expect(requests.some((request) => request.method === "PATCH")).toBe(false)
  } finally {
    await harness.cleanup()
  }
})
