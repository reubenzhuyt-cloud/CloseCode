/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { DialogAgentManage } from "../../../src/component/dialog-agent-manage"
import { DialogAgentEdit } from "../../../src/component/dialog-agent-edit"
import { ConfigProvider } from "../../../src/config"
import { ArgsProvider } from "../../../src/context/args"
import { ClientProvider } from "../../../src/context/client"
import { DataProvider, useData } from "../../../src/context/data"
import { Keymap } from "../../../src/context/keymap"
import { LocalProvider } from "../../../src/context/local"
import { LocationProvider } from "../../../src/context/location"
import { PermissionProvider } from "../../../src/context/permission"
import { RouteProvider } from "../../../src/context/route"
import { ThemeProvider } from "../../../src/context/theme"
import { DialogProvider, useDialog } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { createApi, createEventStream, createFetch, json, type FetchHandler } from "../../fixture/tui-client"
import { emptyThemeSource, tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

const AGENTS = [
  { id: "build", name: "build", mode: "primary", hidden: false, permissions: [] },
  { id: "unitymaster", name: "unitymaster", mode: "subagent", hidden: false, permissions: [] },
  { id: "triage", name: "triage", mode: "primary", hidden: true, permissions: [] },
  { id: "opencode:compaction", name: "compaction", mode: "primary", hidden: true, permissions: [] },
]

async function render(dialog: () => unknown) {
  const temporary = await tmpdir()
  const state = path.join(temporary.path, "state")
  await mkdir(state, { recursive: true })
  const events = createEventStream()
  const location = {
    directory: process.cwd(),
    project: { id: "proj_test", directory: process.cwd(), canonical: process.cwd() },
  }
  const handler: FetchHandler = (url) => {
    if (url.pathname === "/api/location") return json(location)
    if (url.pathname === "/api/agent") return json({ location, data: AGENTS })
    if (url.pathname === "/api/skill")
      return json({ location, data: [{ id: "effect", name: "effect", path: "/skills/effect", content: "" }] })
    if (url.pathname === "/api/mcp") return json({ location, data: [{ name: "linear", status: { status: "connected" } }] })
    return undefined
  }
  const calls = createFetch(handler, events)
  let dialogRef!: ReturnType<typeof useDialog>
  let keymapRef!: ReturnType<typeof Keymap.use>
  function Probe() {
    dialogRef = useDialog()
    keymapRef = Keymap.use()
    const data = useData()
    onMount(async () => {
      await data.location.sync()
      dialogRef.replace(dialog as () => never)
    })
    return null
  }
  const app = await testRender(
    () => (
      <TestTuiContexts paths={{ state }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <ArgsProvider>
            <Keymap.Provider>
              <ToastProvider>
                <RouteProvider initialRoute={{ type: "home" }}>
                  <ClientProvider api={createApi(calls.fetch)}>
                    <PermissionProvider>
                      <DataProvider directory={process.cwd()}>
                        <LocationProvider>
                          <ThemeProvider mode="dark" source={emptyThemeSource}>
                            <LocalProvider>
                              <DialogProvider>
                                <Probe />
                              </DialogProvider>
                            </LocalProvider>
                          </ThemeProvider>
                        </LocationProvider>
                      </DataProvider>
                    </PermissionProvider>
                  </ClientProvider>
                </RouteProvider>
              </ToastProvider>
            </Keymap.Provider>
          </ArgsProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 120, height: 40, kittyKeyboard: true },
  )
  app.renderer.start()
  return {
    app,
    get keymap() {
      return keymapRef
    },
    async cleanup() {
      app.renderer.destroy()
      await temporary[Symbol.asyncDispose]()
    },
  }
}

test("manage dialog lists custom and hidden agents, plus create", async () => {
  const fixture = await render(() => <DialogAgentManage />)
  try {
    const frame = await fixture.app.waitForFrame((value) => value.includes("Agents"))
    expect(frame).toContain("+ Create new agent")
    expect(frame).toContain("build")
    expect(frame).toContain("Hidden (1)")
    expect(frame).toContain("System agents (1)")
    expect(frame).toContain("edit")
    expect(frame).toContain("switch")
    expect(frame).toContain("delete")
  } finally {
    await fixture.cleanup()
  }
})

test("edit dialog shows the fields menu and the skills view opens directly", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" />)
  try {
    const frame = await fixture.app.waitForFrame((value) => value.includes("Edit agent: build"))
    expect(frame).toContain("Description")
    expect(frame).toContain("Mode")
    expect(frame).toContain("Toolset")
    expect(frame).toContain("Permissions")
    expect(frame).toContain("Skills")
    expect(frame).toContain("Save to")
    expect(frame).toContain("project")
  } finally {
    await fixture.cleanup()
  }
})

test("edit dialog skills view lists skills and the wildcard", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" initialView="skills" />)
  try {
    const frame = await fixture.app.waitForFrame((value) => value.includes("Skill activation"))
    expect(frame).toContain("* (all skills)")
    expect(frame).toContain("effect")
  } finally {
    await fixture.cleanup()
  }
})

test("edit dialog toolset view lists MCP server toggles", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" initialView="toolset" />)
  try {
    const frame = await fixture.app.waitForFrame((value) => value.includes("Toolset"))
    expect(frame).toContain("mcp:linear")
  } finally {
    await fixture.cleanup()
  }
})

test("T1 manage dialog opens the edit panel for a subagent via keyboard", async () => {
  const fixture = await render(() => <DialogAgentManage />)
  try {
    await fixture.app.waitForFrame((value) => value.includes("Agents"))
    fixture.keymap.dispatch("dialog.select.home")
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.submit")
    await fixture.app.waitForVisualIdle()
    expect(fixture.app.captureCharFrame()).toContain("Edit agent: unitymaster")
  } finally {
    await fixture.cleanup()
  }
})

test("T2 edit dialog opens the toolset view via keyboard", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" />)
  try {
    await fixture.app.waitForFrame((value) => value.includes("Edit agent: build"))
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.submit")
    await fixture.app.waitForVisualIdle()
    expect(fixture.app.captureCharFrame()).toContain("Toolset (space toggles")
  } finally {
    await fixture.cleanup()
  }
})

test("T3 edit dialog opens the permissions view via keyboard", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" />)
  try {
    await fixture.app.waitForFrame((value) => value.includes("Edit agent: build"))
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.next")
    fixture.keymap.dispatch("dialog.select.submit")
    await fixture.app.waitForVisualIdle()
    expect(fixture.app.captureCharFrame()).toContain("Permissions override")
  } finally {
    await fixture.cleanup()
  }
})

test("T4 edit dialog opens the toolset view by clicking the row", async () => {
  const fixture = await render(() => <DialogAgentEdit name="build" />)
  try {
    const frame = await fixture.app.waitForFrame((value) => value.includes("Edit agent: build"))
    const lines = frame.split("\n")
    const row = lines.findIndex((line) => line.includes("Toolset"))
    const column = lines[row]!.indexOf("Toolset") + 1
    await fixture.app.mockMouse.click(column, row)
    await fixture.app.waitForVisualIdle()
    expect(fixture.app.captureCharFrame()).toContain("Toolset (space toggles")
  } finally {
    await fixture.cleanup()
  }
})
