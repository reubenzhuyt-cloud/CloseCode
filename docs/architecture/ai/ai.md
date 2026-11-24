# AI (`@opencode/ai`)

> last-verified: bf24a67263 @ 2026-11-24

## Responsibility
Owns the provider/LLM layer: provider packages and registry, model routing, LLM/image/video/speech/transcription clients, the tool wire protocol, and provider error classification. It exposes typed clients Core uses; it does not own prompt assembly or the session loop.

## Key Paths
- `packages/ai/src/index.ts` — promise-first `Options`/`RunOptions`/`AssetRunOptions`, `make(options)`, `Client`, `ai`, `tool(...)`, `ToolOptions` (incl. `freeform`), `Services`, `GenerationHandle`; re-exports the schema/types
- `packages/ai/src/providers/`, `provider.ts`, `provider-package.ts`, `providers.ts` — provider registry/packages. Each provider's configure-input type is named `Config` (the `X.LanguageModelOptions` → `X.Config` rename); `provider.ts` `model()` settings are optional when every setting is optional
- `packages/ai/src/providers/*/videos.ts` — video-capable providers (`google`, `openrouter`, `xai`, `minimax`, `byteplus`, `volcengine`)
- `packages/ai/src/route/` — routing and `client.ts` (`LLMClient`), `auth.ts`, `auth-options.ts`
- `packages/ai/src/llm.ts`, `media*.ts`, `image*.ts`, `speech*.ts`, `transcription*.ts`, `video*.ts`, `*-client.ts` — per-modality clients/models (each client has a matching service class, e.g. `VideoClient`)
- `packages/ai/src/protocols/` — wire protocols, incl. video (`google-interactions-video`, `minimax-video`, `openrouter-video`, `seedance-video`, `xai-video`) and `openai-freeform` (freeform tools as OpenAI custom tools)
- `packages/ai/src/schema/`, `utils/`, `experimental/`, `effect.ts`, `public.ts`
- `packages/ai/src/tool.ts`, `tool-history.ts`, `tool-runtime.ts`, `tool-updates.ts` — tool defs, history, and the ordered tool-declaration update model
- `packages/ai/src/provider-error.ts`, `cache-policy.ts`, `effort-updates.ts`, `generation.ts`, `decision*.ts`, `embedding*.ts`, `loop.ts`

## Public API / Key Types
- `LLMClient` / `AIClient` / `ImageClient` / `VideoClient`, `Provider`, `ProviderPackage`, `Auth`
- Each provider's `Config` and `Settings` types; `ProviderPackage.Settings`/`Definition`/`Model` are the shared shapes (the old `LanguageModelOptions` name is gone, and `model()` settings are optional when every key is optional)
- Tool wire types: `ToolInput`, `ToolOptions` (`freeform`), `ToolToModelOutput`, `ToolUpdate`/`ToolUpdateEncoding`
- `isContextOverflow`, `isContextOverflowFailure`, `AIError`
- `packages/ai/src/testing.ts` — test fixtures

## Dependencies
- In: `schema` only (leaf-ish apart from `@ai-sdk/*`).
- Out: `core` (models/runner/generate/tools), `plugin`, `sdk`.

## Links
- Parent: INDEX.md
