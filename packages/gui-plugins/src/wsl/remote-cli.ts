// The part of the SSH plugin's remote CLI scripts that WSL uses. Plugins share only contracts, so
// keep the two copies in step.

export function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function requireVersion(version: string) {
  if (version !== "local" && !/^[0-9][a-zA-Z0-9.+-]*$/.test(version)) throw new Error(version)

  return version
}

export function discoverScript() {
  // `.opencode/bin` DIRECTORY name stays shared, its binary is `closecode`.
  return `cli=""
if [ -z "$cli" ] && [ -x "$HOME/.opencode/bin/closecode" ]; then cli="$HOME/.opencode/bin/closecode"; fi
if [ -n "$cli" ]; then printf '%s\\n' "$cli"; fi
`
}

// Adapters supply a quoted shell expression, including remote HOME or wslpath expansion.
export function versionScript(command: string) {
  return `if [ -x ${command} ]; then ${command} --version 2>/dev/null || true; fi\n`
}

export function parseVersion(output: string) {
  const line = output
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()

  if (!line) return null
  const marker = line.lastIndexOf(" v")
  const version = marker === -1 ? line : line.slice(marker + 2)

  if (!version) throw new Error("V2 CLI did not provide a version")

  return version
}

/** The managed CLI installer also configures the user's shell PATH. */
export function installScript(input: { version: string; binary?: string }) {
  const version = requireVersion(input.version)

  return `set -eu
curl -fsSL https://raw.githubusercontent.com/reubenzhuyt-cloud/CloseCode/dev/install | bash -s -- ${input.binary ? `--binary ${input.binary}` : `--version ${quote(version)}`}
test "$("$HOME/.opencode/bin/closecode" --version | awk '{print $NF}' | sed 's/^v//')" = ${quote(version)}
`
}
