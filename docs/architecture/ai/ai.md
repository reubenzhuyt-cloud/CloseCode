# AI (`@opencode/ai`)

> last-verified: c87e37cd12 @ 2026-10-12

## Responsibility
Owns the provider/LLM layer: provider packages and registry, model routing, LLM/image/speech/transcription/video clients, and provider error classification. It exposes typed clients Core uses; it does not own prompt assembly or the session loop.

## Key Paths
- `packages/ai/src/index.ts` — `AIClient`, `LLMClient`, `ImageClient`, `Auth`, `Provider`, `ProviderPackage`, `isContextOverflow`/`isContextOverflowFailure`, schema re-exports
- `packages/ai/src/providers/`, `provider.ts`, `provider-package.ts`, `providers.ts` — provider registry/packages
- `packages/ai/src/route/` — routing and `client.ts` (`LLMClient`), `auth.ts`
- `packages/ai/src/llm.ts`, `media*.ts`, `image*.ts`, `speech*.ts`, `transcription*.ts`, `video*.ts` — per-modality clients/models
- `packages/ai/src/protocols/`, `schema/`, `utils/`, `experimental/`
- `packages/ai/src/tool.ts`, `tool-history.ts`, `tool-runtime.ts` — tool defs/history for the LLM protocol
- `packages/ai/src/provider-error.ts`, `cache-policy.ts`, `effort-updates.ts`, `generation.ts`

## Public API / Key Types
- `LLMClient` / `AIClient` / `ImageClient`, `Provider`, `ProviderPackage`, `Auth`
- `isContextOverflow`, `isContextOverflowFailure`, `AIError`
- `packages/ai/src/testing.ts` — test fixtures

## Dependencies
- In: `schema` only (leaf-ish apart from `@ai-sdk/*`).
- Out: `core` (models/runner/generate), `plugin`, `sdk`.

## Links
- Parent: INDEX.md
