# Core / LLM & Models

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns model identifiers, provider selection, variant/reasoning resolution, the AI SDK bridge, and lightweight text generation. Does not own the low-level provider clients (that is `@opencode/ai`) nor the session step loop (session/runner.md).

## Key Paths
- `packages/core/src/model.ts` — `Model.ID`, `VariantID`, `Family`, `ReasoningField`, re-exported from `@opencode/schema/model`
- `packages/core/src/model-resolver.ts` — `ModelResolver` service and typed errors (`VariantUnavailableError`, `UnsupportedPackageError`, `ModelConfigurationError`, `ModelInitializationError`, `UnresolvedProviderVariablesError`)
- `packages/core/src/provider.ts` — `Provider.ID`, `AISDK_PREFIX` (`aisdk:`), `isAISDK`, `packageName`
- `packages/core/src/aisdk.ts` — `AISDK.Service` (`@opencode/AISDK`) location-layer bridge to Vercel AI SDK streams
- `packages/core/src/aisdk-native.ts` — `rewrite`/`native` provider-package mapping
- `packages/core/src/variant.ts` — `Variant.resolve(model, supports)` (effort/reasoning variants)
- `packages/core/src/generate.ts` — `Generate.Service` one-shot `text(input)` for titles/summaries
- `packages/core/src/models-dev.ts` — `ModelsDev.Service` catalog snapshots
- `packages/core/src/provider-context` via `session/provider-context.ts`

## Public API / Key Types
- `ModelResolver.Service` (resolves `Model.Ref` → concrete provider/model/variant, or typed error)
- `AISDK.Service`, `Generate.Service` (`text`, `TextInput`, `ModelSelectionError`, `UnavailableError`)
- `Provider.packageName` / `Provider.aisdk` helpers

## Dependencies
- In: `@opencode/ai`, `schema/model`/`provider`, `Generate` uses `LLMClient` + `ModelResolver`.
- Out: session runner, session title/generate, server (`model`/`provider`/`generate` routes), sdk.

## Links
- Parent: INDEX.md
