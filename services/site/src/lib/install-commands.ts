// Every CloseCode install command the site shows: the home install row, the Terminal, Mini and SDK
// pages, the docs, llms.txt, the view-source comment, voice answers and the console API.
// The fork publishes no packages and runs no update service, so there is no npm package, Homebrew
// tap, AUR formula or download backend to name. Every install builds from a clone of the repository,
// checked against this tree on 10 Nov 2026:
// - Windows: script/install-closecode.ps1 builds closecode.exe from the clone, replaces the copies it
//   finds (npm globals, %USERPROFILE%\.opencode\bin), and verifies the binary starts.
// - Everywhere else: `bun run --cwd packages/cli build --single` writes
//   packages/cli/dist/cli-<os>-<arch>/bin/closecode, which goes on PATH.
// - packages/sdk and packages/desktop are workspace packages, so they are not published either.
// The upstream channels (the opencode.ai install scripts, @opencode/cli on npm, the anomalyco/tap
// formulas and opencode-beta on the AUR) install the upstream product, so the site never shows them:
// test/install-commands.test.ts keeps them out.

const repository = "https://github.com/reubenzhuyt-cloud/CloseCode"

/** The home install row, the Terminal and Mini pages, llms.txt, the console API and the view-source comment. */
export const installs = [
  {
    id: "source",
    name: "From source",
    command: `git clone ${repository} && cd CloseCode && bun install && bun run --cwd packages/cli build --single`,
  },
  {
    id: "windows",
    name: "Windows",
    command: `git clone ${repository} && cd CloseCode && pwsh -File ./script/install-closecode.ps1`,
  },
] as const

/** The docs intro's install tabs: the same two paths. */
export const docsInstalls = installs.map((item) => ({ label: item.id, code: item.command }))

/** The SDK is a workspace package in the clone (packages/sdk); the fork publishes no npm packages. */
export const sdkInstalls = [
  {
    id: "source",
    command: `# @opencode/sdk is not published yet: see ${repository}/tree/dev/packages/sdk`,
  },
]

/** The desktop app packages from the clone too, and bundles the CLI, so build that first. */
export const desktopInstall = {
  id: "source",
  command: `git clone ${repository} && cd CloseCode && bun install && bun run --cwd packages/cli build --single && bun run --cwd packages/desktop build`,
}
