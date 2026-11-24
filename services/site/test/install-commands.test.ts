import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Glob } from "bun"
import { desktopInstall, docsInstalls, installs, sdkInstalls } from "../src/lib/install-commands"

// The site shows CloseCode's install paths. These name the upstream product instead (see
// src/lib/install-commands.ts): its install scripts, npm package, tap formulas and AUR packages.
// @opencode/... imports and code samples are not installs, so they only match with a package manager.
const upstream = [
  { name: "the OpenCode 1 install script", pattern: /opencode\.ai\/install\b/ },
  { name: "the OpenCode 2 install script", pattern: /opencode\.ai\/v2\/install/ },
  { name: "the OpenCode 1 npm package", pattern: /(?<![@\w/-])opencode-ai(?![\w/-])/ },
  {
    name: "the OpenCode 2 npm package",
    pattern: /\b(npm|bun|pnpm|yarn|vp)\s+(install|add|i)\b[^\n]*@opencode\/cli(?![\w-])/,
  },
  { name: "the tap's OpenCode 1 formula", pattern: /anomalyco\/tap\/opencode(?![\w-])/ },
  { name: "the OpenCode 2 Homebrew formula", pattern: /anomalyco\/tap\/opencode-v2\b/ },
  { name: "the opencode-bin AUR package", pattern: /\bopencode-bin\b/ },
  { name: "the OpenCode 2 AUR package", pattern: /\b(paru|yay|pacman) -S opencode-beta\b/ },
  { name: "the AUR opencode package", pattern: /\b(paru|yay|pacman) -S opencode(?![\w-])/ },
  { name: "mise's opencode", pattern: /\bmise use -g opencode(?![\w-])/ },
]

const app = path.join(import.meta.dir, "..")
// Site copy and the sources of every generated text file (llms.txt, llms-full.txt, the .md pages,
// the view-source comment, voice answers). Not .output: a stale build would fail the test.
const roots = ["src", "public", "script"]
const text = /\.(tsx?|jsx?|css|md|mdx|txt|json|html|xml|webmanifest)$/
// Stored GitHub data (script/github-snapshot.ts): past release notes may name OpenCode 1 packages
// as history, not as an install command. The V1 docs are OpenCode 1's, so they install it.
const exempt = (file: string) => file === "src/lib/github-snapshot.json" || file.startsWith("src/docs/v1/")

async function files() {
  const found = await Promise.all(
    roots.map((root) =>
      Array.fromAsync(new Glob(`${root}/**/*`).scan({ cwd: app, onlyFiles: true, dot: true })).then(
        (files) => files.map((file) => file.replaceAll("\\", "/")),
        () => [],
      ),
    ),
  )
  return found.flat().filter((file) => text.test(file) && !exempt(file) && !file.includes("node_modules"))
}

describe("install commands", () => {
  test("every command installs this fork", () => {
    const commands = [
      ...installs.map((item) => item.command),
      ...docsInstalls.map((item) => item.code),
      ...sdkInstalls.map((item) => item.command),
      desktopInstall.command,
    ]
    commands.forEach((command) => upstream.forEach((item) => expect(command).not.toMatch(item.pattern)))
    expect(installs.map((item) => item.command)).toEqual([
      "git clone https://github.com/reubenzhuyt-cloud/CloseCode && cd CloseCode && bun install && bun run --cwd packages/cli build --single",
      "git clone https://github.com/reubenzhuyt-cloud/CloseCode && cd CloseCode && pwsh -File ./script/install-closecode.ps1",
    ])
  })

  test("site copy and generated text name no upstream install", async () => {
    const list = await files()
    expect(list.length).toBeGreaterThan(100)
    const hits = (
      await Promise.all(
        list.map(async (file) =>
          (await Bun.file(path.join(app, file)).text()).split("\n").flatMap((line, index) =>
            // Comments may name the upstream packages to explain why the site doesn't.
            /^\s*(\/\/|\*|\/\*)/.test(line)
              ? []
              : upstream.filter((item) => item.pattern.test(line)).map((item) => `${file}:${index + 1} ${item.name}`),
          ),
        ),
      )
    ).flat()
    expect(hits).toEqual([])
  })
})
