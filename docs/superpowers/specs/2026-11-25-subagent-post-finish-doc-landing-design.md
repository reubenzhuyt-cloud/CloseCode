# 子代理“完成后落地”设计（post-finish delta landing）

- 日期：2026-11-25
- 仓库：`E:\Opencode2Fork`，分支 `merge-v2.4`，基线 `a047296609`（fork 版本 v2.4.1）
- 状态：设计已定，待实施
- 交付物：本文档；不修改任何源码

## 1. 问题与目标

分派出去的 subagent 在汇报 `completed` 之后的收尾行为，目前只有两种坏结局：

1. **直接遗忘**：模型报告“完成”即收工，`docs/architecture/UNARCHIVED.md` 里没有它这一轮的 delta，架构漂移只能等 archivist 事后考古。
2. **前台拖慢**：模型自觉地在报告完成前整理文档，于是父级等待的“完成”被前台文档维护推迟，违背 subagent 的并行收益。

根因是“完成”是**一次沉降（settlement）事件**，不是可续期的工作单元：`packages/core/src/session/execution.ts:155-177` 的 `settled` 钩子在每个 busy period 末只触发一次，`packages/core/src/session/execution/subagent-report.ts:131-145` 的 `prepare` 在该沉降中生成唯一的报告。因此任何“完成之后还要做一点事”的诉求，本质上都必须落在**新的 busy period** 上。

目标：subagent 报告 `completed`/`error` 之后，**在后台继续工作**把 delta 落到 `UNARCHIVED.md`，父级不被延迟；这一轮收尾自己结束时，再产生**第二份** `<background-result kind="subagent">` 作为“delta 已落地”的回执。

非目标：**不改变上游的 `completed` 语义**。`state === "completed"` 表示“这一轮工作左右的行为结束了”，我们只在它之后追加一个新周期，而不是把它改成“未完成”。

## 2. 方案取舍

| 方案 | 改动面 | 是否依赖模型自觉 | 时序确定性 |
| --- | --- | --- | --- |
| A. core 新增 `session.finished` hook + 插件 | `hooks.ts`、`execution.ts`、`runner/llm.ts`、`plugin/src/effect/session.ts` 全改 | 否 | 高（hook 在沉降内部同步触发） |
| B. 纯 prompt 自调度（在父级 prompt 里要求子代理完成后再补文档） | 0 行代码 | 是 | 低（模型可能跳步，且前台延迟不可控） |
| C. 收紧前台 delta 契约（要求报告完成前必须写 delta） | 仅 prompt/agent 定义 | 是 | 低（把慢移进前台，与本目标相反） |
| **Z. 插件订阅 `session.inbox.enqueued`，对子会话再 prompt 一轮** | 1 个新插件文件 + 1 行注册 + 1 个 config key | 否 | 高（第二份 report 即回执） |

方案 A 被否决，原因是**合并成本**：`git diff 18c9719c3c..HEAD` 显示 `packages/core/src/plugin/hooks.ts`、`packages/core/src/session/execution.ts`、`packages/core/src/session/runner/llm.ts`、`packages/plugin/src/effect/session.ts`、`packages/core/src/session/inbox.ts`、`packages/core/src/session/subagent-completion.ts`、`packages/core/src/plugin/goal.ts` 全部**与上游逐字节相同**；fork 在全仓唯一偏离这些文件的只有 `packages/core/src/plugin/internal.ts`（2 行，auto-approve 注册）。给 A 加 hook 意味着重新打开 7 个上游热点文件，此后每次上游合并都要在这 7 处冲突。

Z 用**零核心管线改动**实现 A 的行为：报告本身已经作为 synthetic inbox item 发布到父会话，插件只需观察这条公开事件，再向**发报告的子会话**发一轮 prompt。改变的是“谁来启动第二个 busy period”，不是管线。

## 3. 采用方案（Z）

新增 fork 插件 `packages/core/src/config/plugin/post-finish.ts`（导出 `ConfigPostFinishPlugin`），在 `packages/core/src/plugin/internal.ts:315-337` 的 `post` 数组里注册，位置在 `ConfigPolicyPlugin.Plugin`（`:336`）之前。插件形状对标 `packages/core/src/config/plugin/auto-approve.ts:10-22`：`define({ id, effect })` + `yield* Config.Service`。

行为：

1. `yield* ctx.event.subscribe({ types: ["session.inbox.enqueued"] }).pipe(Stream.runForEach(handle), Effect.forkScoped({ startImmediately: true }))`（声明见 `packages/plugin/src/effect/event.ts:6-9`，接线见 `packages/core/src/plugin/host.ts:272-288`；`session.inbox.enqueued` 已在公开清单里，`packages/client/src/effect/api/api.ts:2131`、`packages/schema/src/session-event.ts:665,680`）。
2. 事件 payload 携带整个 `item`（`packages/core/src/session/inbox.ts:198-203`），synthetic item 的 `item.payload.metadata` 是自由记录（`packages/schema/src/session-inbox.ts:32-36`）。
3. 过滤条件：
   - `item.type === "synthetic"`
   - `item.payload.metadata?.source === "subagent"`
   - `metadata.state` ∈ 触发集合（见第 4 节）
   - `typeof metadata.childID === "string"`
   - 该子会话的 agent 在配置白名单内（见第 7 节）
4. 命中后调用 `ctx.session.prompt({ sessionID: metadata.childID, text: <固定提示词>, delivery: "steer" })`（`packages/core/src/session.ts:223-227`、`packages/plugin/src/effect/session.ts:225-245`）。子会话里落进来的 wake 如果发生在沉降窗口内，会被记为 `pendingWake` 并在下一轮启动后继执行（`packages/core/src/session/run-coordinator.ts:115-118,135-144`）。

**不用 `session.experimental.idle`**：在该 hook 里 admit 的输入会**并入同一个 busy period**（`packages/core/src/session/runner/llm.ts:182-194`），也就是会把 `completed` 报告本身推后——正是本设计要避免的。

**必须用同一个子会话**：`experimental.subagent_depth` 默认 1（`packages/core/src/session/subagent-depth.ts:14-20`、`packages/schema/src/config/experimental.ts:60-62`），子代理不能再 spawn 一个 archivist，所以收尾只能回到它自己身上。

## 4. 触发集合

- `completed` — 触发。
- `error` — 触发。一个报错的 coder 可能已经改动了代码，落 delta 比静默漂移更值。
- `cancelled` — **不触发**。用户主动中断，此时任何自动续跑都是反用户意图的越权。
- 自动化运行会话（`ses_aut_*`）永远不产生报告：`packages/core/src/session/execution/subagent-report.ts:139-145` 对无 `parentID` 或 `Automation.isRunSession` 且 `mode === "none"` 的周期直接 `release` 且 `deliver: Effect.void`。因此它们在过滤条件之外自动排除，无需额外判断。

`state` 判定一律读 **`metadata.state`**（原始 job 状态），绝不读 XML 文本里的 `state` 属性——后者在 `recovery.outstanding` 非空时会被降级为 `running`（`packages/core/src/session/subagent-completion.ts:72-73,83`）。

## 5. 幂等与循环防护（关键）

收尾这一轮自己结束时也是**一次沉降**，同样会发 `state === "completed"` 的报告，于是一个天真的过滤器会无限循环。所以必须有去重。

**正确做法**：以 `ctx.storage`（`packages/core/src/plugin/host.ts:675-684`，用法见 `packages/core/src/plugin/goal.ts:43-59`）记录键 `postfinish:<childID>`，语义是**每个子会话全局只追加一次收尾**（永久，不设过期）。

**错误做法**：按 `inboxID` 去重。后续报告每次都会新铸 `SessionMessage.ID.create()`（`packages/core/src/session/execution/subagent-report.ts:180`），ID 永远不同，按 ID 去重等于没有去重。

写入顺序：**先 `prompt` 成功再写标记**。若 `prompt` 失败，标记保持未设置，让下一次报告可以重试，并 `Effect.logWarning` 记录失败原因（失败不能静默）。反过来写（先标记后 prompt）会把“prompt 失败”永久吞掉。

为什么“每个子会话一次”是正确的语义：第一份 `completed` 报告就是它自己的那次机会，此时 delta 还没落，所以补一次；再往后如果又出现 `completed`，那是**父级自己派发的新意图**在推进这个子会话，收尾职责不该再插一脚。一次性语义同时保证收尾最多占用一个额外 busy period，不会链式延长子会话寿命。

## 6. 收尾阶段契约（只回报）

这是用户的明确决定，也是本设计最容易被违反而失效的一条：收尾阶段**只回报**。

收尾阶段**禁止**：

- 修改代码、配置、脚本；
- 大范围阅读源码；
- 运行 lint / typecheck / test / build；
- 触碰 canonical 的 `docs/architecture/INDEX.md` 及 area/module 文档；
- 执行**任何** git 命令；
- 向用户提问。

收尾阶段**必须**：

- 按根 `AGENTS.md` 的 “Architecture Docs” 格式，在 `docs/architecture/UNARCHIVED.md` 追加或更新**恰好一个** delta 块（task/source、受影响的路径与符号、实际改动、可得时的验证证据）；
- 如果这一轮确实没有值得暂存的内容，回一行 `NO-DELTA` 并停止。

固定提示词（中文，逐字使用，附在 `prompt` 的 `text` 里）：

```text
收尾阶段，只回报，不改仓库。

只做一件事：在 docs/architecture/UNARCHIVED.md 追加或更新恰好一个 delta 块，格式遵循根 AGENTS.md 的 Architecture Docs 段落：
- task/source：本次任务与来源
- 受影响路径与符号
- 实际改动
- 验证证据（有则写）

禁止：改动任何代码/配置/脚本；大范围读源码；跑 lint/typecheck/测试/构建；改 docs/architecture 下的 INDEX.md 或 area/module 文档；执行任何 git 命令；向我提问。
若本轮没有值得暂存的内容，只回一行：NO-DELTA
做完直接结束，不要等我确认。
```

## 7. 配置面

在 `packages/schema/src/config.ts` 增加 fork 键 `post_finish`（位置可与 `auto_approve`（`:82-85`）相邻）：

```ts
post_finish: Schema.Union([Schema.Boolean, Schema.Struct({ agents: Schema.Array(Schema.String) })])
  .pipe(optional)
  .annotate({
    description:
      "After a subagent reports finished, keep working in its own session to append one architecture delta to docs/architecture/UNARCHIVED.md. Defaults to true for the `coder` agent; set false to disable, or list the agents to cover.",
  }),
```

- **默认开启**，默认 `agents: ["coder"]`。理由：这是 fork 本地便利，不是安全边界；用户要的是“自动”，而不是“记得去开”。
- **`post_finish: false`** 是显式关闭方式（`Config.latest(yield* config.entries(), "post_finish")`，见 `packages/core/src/config.ts:39-42`）。
- `auto_approve` 采用 opt-in **不**是本键的模板：权限是安全边界，默认必须收紧；本键不是。
- **只读代理永不在白名单**：`researcher`、`reviewer`、`explore` 的 delta 写在它们自己的报告里；`archivist` 本身就是合并方。白名单默认值固定为 `["coder"]`。
- 描述文案沿用现有语气（第三人称陈述、句末给默认值），并保持在 120 列打印宽度内。

## 8. 失败模式

`docs/architecture/UNARCHIVED.md` 目前**没有**任何校验器、linter 或自动合并（`script/`、`.github/`、根 `package.json` 对 “UNARCHIVED” 零命中）。失败是静默的，这是本设计真正的风险来源。

| 失败模式 | 表现 | 缓解 |
| --- | --- | --- |
| 插件未加载 | 完全不触发 | 插件随 `post` 数组注册，随 Location 加载；加载前的窗口见下一行 |
| 订阅尚未生效时报告已发布 | 漏掉该次 delta | bus 是**纯实时**通道，无回放（`packages/core/src/bus.ts:134-138`）；接受为 best-effort |
| 子会话已被删除 | `prompt` 报 NotFound | 捕获为 warning，不写标记；后续无报告则自然无收尾 |
| 写了 delta 但质量低 | 架构文档漂移 | archivist 仍会在合并时校验并改写，`UNARCHIVED.md` 本就是暂存区 |

**明确接受的边界**：本插件是 best-effort。唯一的回执是子会话结尾再发一份 `<background-result kind="subagent">`——父级看到它，才知道 delta 这一轮跑过了；没看到，就等于没落地。不引入重试队列、不引入 outbox、不引入告警。

## 9. 验证计划

工具链：使用 Bun 1.4.4（把 `C:\Users\31087\AppData\Local\Temp\opencode\bun-1.4.4\bun-windows-x64` 前置到 PATH）；本地 bun 1.4.2 无法跑 `bun check`。

- `bun run check`：36/36 全绿。
- `bun run lint`：exit 0。

测试文件：`packages/core/test/post-finish.test.ts`，全部在 `packages/core` 目录内执行（禁止在仓库根跑）。遵循 `.opencode/skills/unit-tests/SKILL.md`：不打 `globalThis` 补丁、不复制实现逻辑进测试、用真实实现。

用例：

- (a) 一份 `completed` 报告 → 对该子会话恰好产生一次 follow-up prompt；
- (b) follow-up 自身的 `completed` 报告 → 不再产生第二次 follow-up；
- (c) `cancelled` → 不产生 follow-up；
- (d) `prompt` 抛错 → 标记未写入，后续报告可重试；
- (e) agent 不在白名单 → 不产生 follow-up。

## 10. 实施顺序

1. `packages/schema/src/config.ts` 加 `post_finish` 键（schema-only，`bun run check` 可先行验证）。
2. 新建 `packages/core/src/config/plugin/post-finish.ts`。
3. `packages/core/src/plugin/internal.ts` 的 `post` 数组在 `ConfigPolicyPlugin.Plugin` 前插入一行注册。
4. 新建 `packages/core/test/post-finish.test.ts`，(a)–(e) 五例。
5. 跑 `bun run check` 与 `bun run lint`。
6. （实施时的独立一步，由 coder 执行）按 `AGENTS.md` 在 `docs/architecture/UNARCHIVED.md` 追加本次改动的 delta。

## 11. 风险与未决

- **上游可能自带 post-finish hook**：若上游日后在沉降路径里提供等价能力，Z 应退役，改用上游机制，并删除本插件与 `post_finish` 键。
- **实时 bus 的加载窗口**：`ctx.event.subscribe` 生效前发表的报告无法补回（无回放）；插件加载晚于子会话沉降时会漏一次。
- **`state` 双源差异**：`metadata.state` 是原始 job 状态，XML `state` 属性可能被降级成 `running`（`packages/core/src/session/subagent-completion.ts:72-73,83`）。过滤器必须只看 metadata，任何解析 XML 文本的实现都是错的。
- **成本**：每个命中的子会话多消耗一次轻量 turn；白名单默认只有 `coder`，且每个子会话至多一次，接受。
