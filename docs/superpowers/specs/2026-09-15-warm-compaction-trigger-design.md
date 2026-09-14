# Warm Compaction Trigger (absolute token threshold) — Design

Date: 2026-09-15
Status: proposed (awaiting user approval)

## Goal

Two compaction mechanisms coexist:

1. **Overflow auto compaction (existing, unchanged).** Model-derived threshold
   (`usable()`), cold path via `SessionCompaction.process` (fresh prefix:
   `system: []`, `tools: {}`, compaction agent). Protects small-context models
   from overflowing.
2. **Threshold auto compaction (new).** Fires on an absolute token count
   (default 144000), independent of the model context, and runs through the
   warm prefix-preserving path added for `/compact` so the provider prompt
   cache is reused. Cheaper, so it fires earlier than overflow.

## Non-goals

- No change to the cold path, its summary template, or `compaction.process`.
- No clamping of the threshold to `usable()`.
- No change to `/compact` semantics: still full-history replacement, no tail.
- No change to the V2 core compaction (`packages/core/src/session/compaction.ts`
  defaults, `packages/core/src/config/compaction.ts`); `packages/opencode` does
  not read them.

## Approved decisions

- Trigger value: absolute `trigger_tokens`, default `144000`, overridable from
  JSON. `0` disables the new mechanism.
- Summary + verbatim tail: keep the most recent ~8000 tokens of history
  verbatim (aligned with V2 core `DEFAULT_KEEP_TOKENS = 8_000`), overridable via
  the existing `compaction.preserve_recent_tokens`.
- If the warm request itself would overflow the model (including
  `/compact` on a huge history), fall back to the cold path.
- Autoupdate stays off by default: already committed fork-wide
  (`2ae49a357`, `packages/core/src/flag/flag.ts:23`). No code change.

## Design

### Config

`packages/core/src/v1/config/config.ts:149-172` — add to the `compaction` struct:

```ts
trigger_tokens: Schema.optional(NonNegativeInt)
```

No schema default; the runtime default lives at the trigger check.

### Trigger policy

`packages/opencode/src/session/overflow.ts`:

- Extract the shared token count
  (`tokens.total || input + output + cache.read + cache.write`) into a helper
  used by both `isOverflow` and the new check.
- `DEFAULT_TRIGGER_TOKENS = 144_000`.
- `isTrigger({ cfg, tokens, model })`:
  - `false` when `cfg.compaction?.auto === false` (respects
    `OPENCODE_DISABLE_AUTOCOMPACT`),
  - `false` when the resolved threshold is `<= 0` (disabled),
  - `false` when `model.limit.context === 0`,
  - otherwise `count >= (cfg.compaction?.trigger_tokens ?? 144_000)`.

### Loop wiring

`packages/opencode/src/session/prompt.ts` (`runLoop`):

- Next to the existing overflow check (`1321-1328`), add: when
  `lastFinished.summary !== true` and `isTrigger` is true, call
  `compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model,
  auto: true, overflow: false })` and `continue`. Overflow is checked first, so
  `trigger >= usable` can never fire early or fight the cold path.
- In the compaction task branch (`1293-1319`) replace the unconditional
  `if (task.auto)` cold dispatch with:

  ```
  cold = task.auto && lastFinished && (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))
  if (cold) -> compaction.process(...)            // unchanged
  else     -> manualCompaction({ ..., tailTokens: task.auto ? triggerTailTokens(cfg) : 0 })
  ```

  `manualCompaction` returning `"fallback"` keeps the existing cold path call.

  Consequences: overflow is always cold; a threshold-only compaction
  (144k ≤ count < usable) is warm; `/compact` (`auto: false`) is unchanged and
  still falls back to cold when the warm request would overflow.

### Tail

`packages/opencode/src/session/compaction.ts`:

- `DEFAULT_TRIGGER_TAIL_TOKENS = 8_000` and
  `triggerTailTokens(cfg) = cfg.compaction?.preserve_recent_tokens ?? 8_000`.
- `tailStart({ messages, budget }): MessageID | undefined` — backward
  turn-based token walk returning the first message ID of the kept tail. The
  walk currently embedded in `select` (`223-269`) is the single source of these
  semantics: extract it into a private helper used by both `select` and
  `tailStart` instead of duplicating it.

`prompt.ts` `manualCompaction`:

- New input `tailTokens: number`.
- On `result === "continue"`, find the marker's `compaction` part and, when
  `tailTokens > 0`, persist `tail_start_id` from `tailStart(history, tailTokens)`
  (same write path as `packages/opencode/src/session/compaction.ts:461-466`).
- The summary instruction is unchanged (it still summarizes the whole history);
  the tail is additionally retained verbatim.

### Post-compaction context

No change. `filterCompacted` (`packages/opencode/src/session/message-v2.ts:521-572`)
already reorders to `[compaction marker, summary assistant, retained tail, later messages]`
and reads `tail_start_id`.

## Rejected alternatives

- **Persist a `warm` flag on the compaction part.** Adds a persisted/API field
  for information the loop can re-derive, and is less safe: re-deriving via
  `isOverflow` also covers the case where the context grew after the marker was
  created.
- **Clamp the threshold to `usable()`.** With clamping the warm path would sit
  exactly at the overflow boundary and always fall back to cold; ordering
  overflow-first already guarantees the threshold never preempts it.
- **A new config key for the tail.** Reuses `preserve_recent_tokens` with an 8k
  fallback; one fewer knob.
- **Summarizing only the head (with a boundary hint in the instruction).**
  Deferred: needs instruction parameterization shared with the cold path.

## Risks

- The warm path re-sends full history; if that exceeds the model context the
  processor returns `"compact"` and we fall back to the cold path (implemented
  and covered by tests).
- Summary/tail redundancy: kept tail is also described in the summary. Token
  cost only, no information loss.
- Prefix-cache misses when the system prompt drifts (date rollover, agent or
  model switch right before compaction) — pre-existing limitation of the warm
  path.
- `trigger_tokens` is honored only by the V1 config schema used by
  `packages/opencode`.

## Verification

- `bun typecheck` from `packages/opencode`.
- `bun test test/session/compaction.test.ts test/session/revert-compact.test.ts`
  (baseline 66 pass / 1 skip).
- `bun test test/session/prompt.test.ts --timeout 90000` (baseline 45 pass /
  14 skip).
- New tests: threshold fires the warm path; overflow takes precedence over the
  threshold; `tail_start_id` is persisted when a tail budget is set; warm
  overflow falls back to cold.
- Manual smoke on the dev server: drive a session past 144k, confirm the
  compaction request is logged as the session's own agent (warm path), the cache
  read is non-trivial, and the tail survives.

## Rollout

- Commit on `dev` (implementation only; generated SDK/CRLF noise excluded).
- Build the single-file binary with `OPENCODE_VERSION=1.18.31-warm` and
  channel `latest`, back up the installed binary, then replace it.
- Autoupdate is already disabled for this fork; a hand-built binary also reports
  `Installation.method() === "unknown"`, which suppresses upgrades.
