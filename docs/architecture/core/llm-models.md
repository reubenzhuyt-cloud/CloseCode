# Core / LLM & Models

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns model identifiers, provider selection, variant/reasoning and speed resolution, the AI SDK bridge, and lightweight text generation. Does not own the low-level provider clients (that is `@opencode/ai`) nor the session step loop (session/runner.md).

## Key Paths
- `packages/core/src/model.ts` — `Model.ID`, `VariantID`, `Family`, `ReasoningField`, re-exported from `@opencode/schema/model`
- `packages/core/src/model-resolver.ts` — `ModelResolver` service and typed errors (`VariantUnavailableError`, `UnsupportedPackageError`, `ModelConfigurationError`, `ModelInitializationError`, `UnresolvedProviderVariablesError`)
- `packages/core/src/provider.ts` — `Provider.ID`, `AISDK_PREFIX` (`aisdk:`), `isAISDK`, `packageName`; `loadPackage` resolves from the static `builtins` table and an unknown `@opencode/ai/*` specifier fails with `LoadError`
- `packages/core/src/aisdk.ts` — `AISDK.Service` (`@opencode/AISDK`) location-layer bridge to Vercel AI SDK streams
- `packages/core/src/aisdk-native.ts` — `rewrite`/`native` provider-package mapping
- `packages/core/src/variant.ts` — `Variant.resolve(model, supports)` (effort/reasoning variants)
- `packages/core/src/generate.ts` — `Generate.Service` one-shot text plus `video` (`VideoInput`, `VideoFile`); the image/video model selection used by `generate_image`/`generate_video`
- `packages/core/src/video-generation.ts` — durable video jobs (24h record retention, videos as blobs) that outlive the request
- `packages/core/src/models-dev.ts` — `ModelsDev.Service` catalog snapshots; the `recommended_api` and `model_speeds` flags feed its resolution
- `packages/core/src/model-retry.ts`, `provider-context` via `session/provider-context.ts`

## Public API / Key Types
- `ModelResolver.Service` (resolves `Model.Ref` → concrete provider/model/variant, or typed error)
- `AISDK.Service`, `Generate.Service` (`text`, `image`, `decisions`, `video.{start,status,result,cancel}`, `VideoInput`, `VideoFile`, `ModelSelectionError`, `UnavailableError`), `VideoGeneration.Service`
- `Provider.packageName` / `Provider.aisdk` helpers; `model_speeds` exposes fast/flex tiers as speeds of one model entry

## Dependencies
- In: `@opencode/ai`, `schema/model`/`provider`, `Generate` uses `LLMClient` + `ModelResolver`.
- Out: session runner, session title/generate, server (`model`/`provider`/`generate` routes), sdk.

## Links
- Parent: INDEX.md
