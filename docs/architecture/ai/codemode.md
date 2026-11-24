# Code Mode (`@opencode/codemode`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Effect-native confined code execution over schema-described tools: runs model-authored programs on the VM language runtime with a curated set of globals, exposing tools as namespaces. Owns the execution contract, tool/extension declarations, and the tool-call hooks; Core wires it as the `execute` tool and renders its catalog.

## Key Paths
- `packages/codemode/src/index.ts` — `CodeMode`, `Extension`, `Namespace`, `Tool`, `OpenAPI` namespaces; `searchSignature`, `toolExpression`, `ToolError`/`toolError`, snapshots (`toBytes`/`fromBytes`), `SuspendError`
- `packages/codemode/src/codemode/codemode.ts` — `make`, `execute`, `Runtime`, `Input`, `Result` (`Success` | `Failure`), `Diagnostic`/`DiagnosticKind`, `ExecutionLimits`, `RunOptions`/`ProgramOptions`; the language itself comes from the `psychoscript` dependency (was a hand-written interpreter under `src/interpreter/` + `src/stdlib/`, both deleted)
- `packages/codemode/src/codemode/tool-runtime.ts` — `hooked`, `Hooks`, `ToolCall`/`ToolInvocation`/`ExtensionInvocation`, `CallResult`, `ToolDescription`, `Services`
- `packages/codemode/src/codemode/tool.ts`, `tool-schema.ts`, `tools.ts`, `namespace.ts`, `extension.ts`, `scan.ts`, `tool-error.ts`
- `packages/codemode/src/codemode/openapi/` — OpenAPI-derived tool surface (`index`, `runtime`, `spec`, `types`)
- `packages/core/src/codemode/` — Core-side wiring: `tool.ts` (the `execute` tool, `full_codemode` globals), `catalog.ts`, `instructions.ts`, `job.ts` (background hand-off), `path.ts`, `bun.ts`, `api.ts` (`opencode://` fetch), `diffs.ts`, `execution.ts`, `fetch.ts`
- `packages/core/src/tool.ts` — `codeModeAvailable(policy)`, the Code Mode/direct split, and the cached catalog inventory

## Public API / Key Types
- `CodeMode`, `Tool`, `Namespace`, `Extension`, `OpenAPI` namespaces
- `CodeMode.Result`, `CodeMode.ExecutionLimits`, `CodeMode.Runtime`
- `ToolError` / `toolError`, `searchSignature`, `toolExpression`

## Notes
- A program's `execute` call is always a fresh program; `full_codemode` adds the `timeout`/`background` inputs, the session `services` globals (`path`, `Bun`), and job-backed execution (`codemode/job.ts`).
- Tools reach the model through the rendered catalog, not through the program text; the catalog is cached per registry revision and visible tool set.
- `experimental.codemode_vm` is deprecated and ignored: Code Mode always runs on the VM (`packages/schema/src/config/experimental.ts`).

## Dependencies
- In: `schema`, `effect`, `psychoscript`, `acorn`.
- Out: `core` (tool registry + catalog instructions), `sdk`.

## Links
- Parent: INDEX.md
