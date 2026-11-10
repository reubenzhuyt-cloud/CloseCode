import { config } from "~/config"
import { docsUrl, v1DocsUrl } from "~/lib/docs"
import { docsInstalls } from "~/lib/install-commands"
import { blocks, codeFence, link, richToMarkdown, type RichText } from "~/lib/markdown"

// The docs mock in the new site layout, shared by the page and its Markdown version. Content mirrors
// https://opencode.ai/docs/ (the Intro page).

export const docsProducts = [
  { label: "Docs", href: docsUrl() },
  { label: "CLI", href: docsUrl("/cli") },
  { label: "Build", href: docsUrl("/build") },
  { label: "API", href: docsUrl("/api") },
  { label: "Console", href: docsUrl("/console") },
  { label: "V1", href: v1DocsUrl() },
]

export const docsPages = [
  { label: "Intro", href: docsUrl() },
  { label: "Config", href: docsUrl("/config") },
  { label: "V1 migration", href: docsUrl("/migrate-v1") },
  { label: "Troubleshoot", href: docsUrl("/troubleshooting") },
]

export const docsConfigure = [
  "Agents",
  "Models",
  "Skills",
  "Themes",
  "Commands",
  "Plugins",
  "Providers",
  "Web search",
  "Network",
  "Snapshots",
  "Compaction",
  "Formatters",
  "References",
  "Attachments",
  "Tools",
  "MCP servers",
  "Permissions",
  "Policies",
  "Instructions",
  "Warming",
  // The live docs' slugs: hyphenated labels, except Web search, which is /websearch.
].map((label) => ({
  label,
  href: docsUrl(`/${label === "Web search" ? "websearch" : label.toLowerCase().replaceAll(" ", "-")}`),
}))

export { docsInstalls }

const desktopBuild = "bun run --cwd packages/desktop build"

export const docsToc = [
  { id: "cli", label: "CLI" },
  { id: "desktop", label: "Desktop" },
  { id: "web", label: "Web" },
  { id: "docker", label: "Docker" },
  { id: "connect", label: "Connect" },
  { id: "customize", label: "Customize" },
  { id: "learn", label: "Learn" },
]

/** The Intro article: its prose, by section. */
export const docsIntro = {
  title: "Intro",
  /** The page's `<title>`, 50–60 characters. */
  metaTitle: "OpenCode | Install OpenCode and connect a provider",
  description:
    "Get started with OpenCode. Install the CLI, desktop app, web or Docker version, connect a model provider, and find your way around the rest of the docs.",
  lead: "OpenCode is an open source coding agent. It's available as a desktop app, a terminal interface, a mobile app and an SDK.",
  cli: [
    [
      "CloseCode publishes no npm package, package manager formula or installer, so both tabs build from a clone of the repository, with Bun and Git installed."
    ],
    [
      "On Windows, ",
      { code: "script/install-closecode.ps1" },
      " builds ",
      { code: "closecode.exe" },
      ", replaces the copies it finds (npm globals and ",
      { code: "%USERPROFILE%\\.opencode\\bin" },
      "), verifies that the binary starts, and prints how to add that directory to your ",
      { code: "PATH" },
      " (",
      { code: "-AddToPath" },
      " does it for you).",
    ],
    [
      "Elsewhere, the build writes ",
      { code: "packages/cli/dist/cli-<os>-<arch>/bin/closecode" },
      ". Put that directory on your ",
      { code: "PATH" },
      ", for example ",
      { code: `export PATH="$PWD/packages/cli/dist/cli-linux-x64/bin:$PATH"` },
      ".",
    ],
    ["There are no standalone binaries to download, and Windows package managers are not supported."],
  ] satisfies RichText[],
  desktop: ["The desktop app builds from the same clone, from the CLI you just built:"] satisfies RichText,
  desktopNote: "No desktop installers are published either.",
  web: {
    lead: ["Access the web interface with the ", { code: "closecode pair" }, " command."] satisfies RichText,
    command: "closecode pair",
    output: "  Open a link to connect. Links work once and expire in 5 minutes.",
    url: "http://127.0.0.1:49374/auth/connect/...",
  },
  docker: ["No Docker images are published for CloseCode; build one from a clone of the repository."] satisfies RichText,
  connect: [
    [
      "OpenCode has built-in support for many LLM providers. You can connect to them directly ",
      { text: "in the TUI", href: docsUrl("/cli/providers") },
      " with ",
      { code: "/connect" },
      ".",
    ],
    ["See ", { text: "Providers", href: docsUrl("/providers") }, " to configure custom providers."],
    [
      "If you'd like easy access to the best coding models, you can try out ",
      { text: "OpenCode Console", href: docsUrl("/console") },
      ".",
    ],
    [
      "You can also try ",
      { text: "OpenCode Go", href: docsUrl("/console/go") },
      ", a subscription plan from $10/month that grants you access to the best coding models.",
    ],
  ] satisfies RichText[],
  customize: [
    "Make OpenCode your own by editing the ",
    { text: "OpenCode config", href: docsUrl("/config") },
    ", ",
    { text: "loading plugins", href: docsUrl("/plugins") },
    ", ",
    { text: "connecting MCP servers", href: docsUrl("/mcp-servers") },
    ", or ",
    { text: "creating commands", href: docsUrl("/commands") },
    ". For terminal interface themes and keybindings, see ",
    { text: "CLI settings", href: docsUrl("/cli/config") },
    ".",
  ] satisfies RichText,
  learn: [
    "If you are interested in an in-depth course on OpenCode, Boot.dev has created an excellent ",
    { text: "AI Coding with OpenCode", href: "https://www.boot.dev/courses/learn-ai-coding", external: true },
    " course in consultation with our team. All the information in the course is free to read and watch, though some interactive features may require payment.",
  ] satisfies RichText,
}

/** The docs Intro page as Markdown, with the docs navigation after it. */
export function docsMarkdown() {
  const intro = docsIntro
  const list = (items: { label: string; href: string }[]) =>
    items.map((item) => `- ${link(item.label, item.href)}`).join("\n")

  return blocks(
    `# ${intro.title}`,
    intro.lead,
    "## CLI",
    codeFence("bash", docsInstalls.map((item) => `# ${item.label}\n${item.code}`).join("\n\n")),
    ...intro.cli.map(richToMarkdown),
    "## Desktop",
    richToMarkdown(intro.desktop),
    codeFence("bash", `$ ${desktopBuild}`),
    intro.desktopNote,
    "## Web",
    richToMarkdown(intro.web.lead),
    codeFence("bash", `$ ${intro.web.command}\n\n${intro.web.output}\n\n  ${intro.web.url}`),
    "## Docker",
    richToMarkdown(intro.docker),
    "## Connect",
    ...intro.connect.map(richToMarkdown),
    "## Customize",
    richToMarkdown(intro.customize),
    "## Learn",
    richToMarkdown(intro.learn),
    "---",
    `Docs index for agents: ${link("llms.txt", docsLlms)}. Source: ${link("GitHub", config.github.repoUrl)}`,
    "### Docs",
    list(docsProducts),
    "### Pages",
    list(docsPages),
    "### Configure",
    list(docsConfigure),
  )
}

/** The docs' own llms.txt, which the docs serve under /docs on opencode.ai. */
export const docsLlms = "/docs/llms.txt"
