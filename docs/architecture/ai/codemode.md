# Code Mode (`@opencode/codemode`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Effect-native confined code execution over schema-described tools: interprets model-authored code in a sandbox with a curated standard library, exposing tools as namespaces. Owns the interpreter and tool-schema contracts; Core wires it as a tool.

## Key Paths
- `packages/codemode/src/index.ts` — `CodeMode`, `Extension`, `Namespace`, `Tool`, `OpenAPI`; `searchSignature`, `toolExpression`, `ToolError`
- `packages/codemode/src/interpreter/` — `execute.ts`, `interpreter.ts`, `intrinsics.ts`, `globals.ts`, `objects.ts`, `promises.ts`, `references.ts`, `scope.ts`, `limits.ts`, `spec.ts`, `native.ts`, `callback.ts`, `generators.ts`, `errors.ts`
- `packages/codemode/src/stdlib/` — sandbox stdlib (`array`, `bytes`, `collections`, `console`, `date`, `headers`, `iterator`, `json`, `math`, `number`, `object`, `regexp`, `string`, `url`, `value`, `web`)
- `packages/codemode/src/tool.ts`, `tool-runtime.ts`, `tool-schema.ts`, `tools.ts`, `namespace.ts`, `extension.ts`
- `packages/codemode/src/openapi/` — OpenAPI-derived tool surface
- `packages/core/src/codemode/` — Core-side catalog/instructions/web wiring

## Public API / Key Types
- `CodeMode`, `Tool`, `Namespace`, `Extension`, `OpenAPI` namespaces
- `ToolError` / `toolError`, `searchSignature`, `toolExpression`

## Dependencies
- In: `schema`, `effect`.
- Out: `core` (tool registry), `sdk`.

## Links
- Parent: INDEX.md
