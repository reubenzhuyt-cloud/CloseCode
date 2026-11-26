# 子代理“完成后落地”设计（post-finish delta landing）

> last-verified: c36085bb25 @ 2026-11-26

- 日期：2026-11-25（2026-11-26 按已落地实现修订）
- 仓库：`E:\Opencode2Fork`，分支 `merge-v2.4`，基线 `a047296609`（fork 版本 v2.4.1）
- 状态：已实施（`8901dc4205`、`cee4bf4084`、`c36085bb25`）
- 交付物：本设计文档；实现见第 10、12 节列出的 7 个文件

## 1. 问题与目标

分派出去的 subagent 在汇报 `completed` 之后的收尾行为，目前只有两种坏结局：

1. **直接遗忘**：模型报告“完成”即收工，`docs/architecture/UNARCHIVED.md` 里没有它这一轮的 delta，架构漂移只能等 archivist 事后考古。
2. **前台拖慢**：模型自觉地在报告完成前整理文档，于是父级等待的“完成”被前台文档维护推迟，违背 subagent 的并行收益。

根因是“完成”是**一次沉降（settlement）事件**，不是可续期的工作单元：`packages/core/src/session/execution.ts:155-177` 的 `settled` 钩子在每个 busy period 末只触发一次，`packages/core/src/session/execution/subagent-report.ts:134-215` 的 `prepare` 在该沉降中生成唯一的报告。因此任何“完成之后还要做一点事”的诉求，本质上都必须落在**新的 busy period** 上。

目标：subagent 报告 `completed`/`error` 之后，**在后台继续工作**把 delta 落到 `UNARCHIVED.md`，父级不被延迟；这一轮收尾自己结束时**不再回父级报告**（core 的静默标记），改为向人类发一条 `tui.toast.show` 作为“delta 已落地”的回执（原设计设想的“第二份 `<background-result>`”已作废，见第 8、12 节）。

非目标：**不改变上游的 `completed` 语义**。`state === "completed"` 表示“这一轮工作左右的行为结束了”，我们只在它之后追加一个新周期，而不是把它改成“未完成”。

## 2. 方案取舍

| 方案 | 改动面 | 核心改动 | 是否依赖模型自觉 | 时序确定性 |
| --- | --- | --- | --- | --- |
| A. core 新增 `session.finished` hook + 插件 | `hooks.ts`、`execution.ts`、`runner/llm.ts`、`plugin/src/effect/session.ts` 全改 | 7 个上游热点文件 | 否 | 高（hook 在沉降内部同步触发） |
| B. 纯 prompt 自调度（在父级 prompt 里要求子代理完成后再补文档） | 0 行代码 | 0 | 是 | 低（模型可能跳步，且前台延迟不可控） |
| C. 收紧前台 delta 契约（要求报告完成前必须写 delta） | 仅 prompt/agent 定义 | 0 | 是 | 低（把慢移进前台，与本目标相反） |
| **Z. 插件订阅 inbox/沉降事件，对子会话再 prompt 一轮** | 1 个新插件文件 + 1 行注册 + 1 个 config key + 1 行 normalize | **1 处受批准的 seam（`subagent-report.ts`，净 +52 行）** | 否 | 高（收尾沉降由 core 标记静默，回执走 toast） |

方案 A 被否决，原因是**合并成本**：`git diff 18c9719c3c..HEAD` 显示 `packages/core/src/plugin/hooks.ts`、`packages/core/src/session/execution.ts`、`packages/core/src/session/runner/llm.ts`、`packages/plugin/src/effect/session.ts`、`packages/core/src/session/inbox.ts`、`packages/core/src/session/subagent-completion.ts`、`packages/core/src/plugin/goal.ts` 全部**与上游逐字节相同**，Z 落地后依然如此。给 A 加 hook 意味着重新打开这 7 个上游热点文件，此后每次上游合并都要在这 7 处冲突。Z 只额外改动了一个上游文件 `subagent-report.ts`（见下），插件注册照旧落在 `internal.ts` 那一处——该文件是 fork 唯一有意偏离上游的地方（auto-approve 与 post-finish 各 2 行）。

Z 原本设想是**零核心管线改动**：报告本身已经作为 synthetic inbox item 发布到父会话，插件只需观察这条公开事件，再向**发报告的子会话**发一轮 prompt。实施时发现零 core 不可行——收尾那一轮的沉降会再发一份 `<background-result>` 给父级，而“静默这一份”必须发生在沉降自己的事务里（见下文 seam 与第 12 节）。于是 Z 落地为**插件为主 + 一处受批准的 core seam**：`packages/core/src/session/execution/subagent-report.ts` 的 `prepare` 增加第三个 disjunct，只在 `jobState.mode === "none"` 且会话带有 `post-finish` 静默标记时吞掉报告，并在同一个 `BEGIN IMMEDIATE` 事务里清掉标记。

**为什么不用一个 `ses_aut_*` 会话承载收尾**：那本来是零 core 的核心思路——新会话不继承父级 busy period，天然不打扰父级。但新会话**没有子代理这一轮的上下文**，想写 delta 就必须重读源码与文档，直接违背第 6 节“只回报、不读文件”的硬约束。所以收尾必须回到**原来那个子会话**，代价就是必须能静默它自己的下一次沉降，也就有了上面那处 seam。

seam 的 52 行**不可实质性压缩**：清标记必须和 `store.release`、终态发布处于同一个 `BEGIN IMMEDIATE` 事务（`bus.ts:316-317` 开事务，`bus.ts:404` 调 `commit` 回调），否则插件在另一个 fiber 里清标记，与下一次 `prepare` 没有顺序保证，就会重演“报告被吞”的 bug。两种更干净的写法（给 `SessionStore` 加 `clearMetadataKey`，或把 `db` 塞进 `Deps`）都要重新打开上游逐字节相同的文件，正是本工作要避免的。

## 3. 采用方案（Z）

新增 fork 插件 `packages/core/src/config/plugin/post-finish.ts`，插件 id 为 `opencode.config.post-finish`，导出 `ConfigPostFinishPlugin`。在 `packages/core/src/plugin/internal.ts:337` 的 `post` 数组里注册，位置在 `ConfigAutoApprovePlugin.Plugin` 与 `ConfigPolicyPlugin.Plugin`（`:338`）之间。插件形状对标 `packages/core/src/config/plugin/auto-approve.ts:10-22`：`define({ id, effect })` + `yield* Config.Service`。

订阅**一条四类型流**（一个订阅，不是两个）：

```ts
ctx.event.subscribe({ types: ["session.inbox.enqueued", "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"] })
```

- **为什么必须是一个订阅**：bus 在单个订阅内保持跨类型的发布顺序，所以“原始 completed 报告”一定先于它之后的沉降被处理。拆成两个订阅会反向竞争，把原始沉降误认成收尾那一轮。
- `session.inbox.enqueued` 已在公开清单里（`packages/schema/src/session-event.ts:665,680`），payload 携带整个 `item`（`packages/core/src/session/inbox.ts:198-203`），synthetic item 的 `item.payload.metadata` 是自由记录（`packages/schema/src/session-inbox.ts:32-36`）。
- 三个 `session.execution.*` 终态事件用于回执：收尾那一轮的沉降落地（succeeded / failed / interrupted）才 toast。

行为：

1. 过滤条件（`handle`）：
   - `item.type === "synthetic"`
   - `item.payload.metadata?.source === "subagent"`
   - `metadata.state` ∈ {`completed`, `error`}（见第 4 节）
   - `typeof metadata.childID === "string"`、`typeof metadata.agent === "string"`
   - `agent` 不在硬拒集合（先于配置查询，见第 7 节）
   - 该 agent 在配置白名单内（见第 7 节）
   - 该子会话的 `MARKER` 尚未设置
2. 命中后依次（`suppressReport` + `prompt`）：
   - `ctx.session.update` 在子会话 metadata 上写 `post-finish: { silent: true }`（经 `SubagentReport.SILENT_METADATA_KEY`）；
   - 写 `postfinish-pending:<child>` 到 `ctx.storage`（先于 prompt，保证本轮沉降不会早于自己的回执）；
   - `ctx.session.prompt({ sessionID: childID, text: PROMPT, delivery: "steer" })`；
   - 成功后写 `postfinish:<child>`。
3. 收尾沉降（`settle`）：消费 `postfinish-pending:<child>`，按事件类型吐 toast；`interrupted` 静默；`failed` 吐 warning 且不重试。

**不用 `session.experimental.idle`**：在该 hook 里 admit 的输入会**并入同一个 busy period**（`packages/core/src/session/runner/llm.ts:182-194`），也就是会把 `completed` 报告本身推后——正是本设计要避免的。

**必须用同一个子会话**：`experimental.subagent_depth` 默认 1（`packages/core/src/session/subagent-depth.ts:14-20`、`packages/schema/src/config/experimental.ts:60-62`），子代理不能再 spawn 一个 archivist，所以收尾只能回到它自己身上。

## 4. 触发集合

- `completed` — 触发。
- `error` — 触发。一个报错的 coder 可能已经改动了代码，落 delta 比静默漂移更值。
- `cancelled` — **不触发**。用户主动中断，此时任何自动续跑都是反用户意图的越权。
- 自动化运行会话（`ses_aut_*`）永远不产生报告：`packages/core/src/session/execution/subagent-report.ts:145-157` 对无 `parentID` 或 `Automation.isRunSession` 且 `mode === "none"` 的周期直接 `release` 且 `deliver: Effect.void`。因此它们在过滤条件之外自动排除，无需额外判断。

`state` 判定一律读 **`metadata.state`**（原始 job 状态），绝不读 XML 文本里的 `state` 属性——后者在 `recovery.outstanding` 非空时会被降级为 `running`（`packages/core/src/session/subagent-completion.ts:72-73,83`）。

## 5. 幂等与循环防护（关键）

收尾这一轮自己结束时也是**一次沉降**，同样会发 `state === "completed"` 的报告，于是一个天真的过滤器会无限循环。所以必须有去重。

**三件状态各管一件事**：

| 状态 | 位置 | 生命周期 | 作用 |
| --- | --- | --- | --- |
| `postfinish:<child>`（`MARKER`） | 插件 KV（`ctx.storage`，`host.ts:675-689`） | 持久，随 DB 存活 | 每个子会话**全局只追加一次**收尾，永久不设过期 |
| `postfinish-pending:<child>`（`PENDING`） | 插件 KV | 临时，收尾沉降时消费 | 证明“当前这轮沉降是我这一轮收尾”，回执因此不会误记第二次 |
| `post-finish` 静默标记 | 会话 metadata（`ctx.session.update`） | **单次使用**，core 在其沉降事务中清除 | 让这一次沉降不回父级报告 |

`MARKER` 必须是插件 KV 而不是按 `inboxID` 去重：后续报告每次都会新铸 `SessionMessage.ID.create()`（`subagent-report.ts:195`），ID 永远不同，按 ID 去重等于没有去重。

**静默标记是单次使用**：`prepare` 读标记、`commit` 在 `Bus.publish` 的 `BEGIN IMMEDIATE` 事务内 `json_remove` 标记（`subagent-report.ts:155,172`；事务见 `bus.ts:316-317`，`commit` 回调见 `bus.ts:404`）。读与清落在同一个沉降里，所以父级之后自己发起的一轮会正常报告。标记存在但**未被采纳**（`mode === "background"`）时，也在报告路径的 commit 里清掉（`subagent-report.ts:168-172`），避免一个游离的标记把后来的合法报告吞掉。

**硬拒集合先于配置查询**：`researcher`、`reviewer`、`explore`、`archivist` 在 `handle` 里直接 return，即使配置把它们列进白名单也不生效。

写入顺序：**先 `prompt` 成功再写 `MARKER`**。若 `prompt` 失败，`PENDING` 与静默标记都会被撤掉（`suppressMark`），让下一次报告可以重试，同时 `Effect.logWarning` 记录原因（失败不能静默）。反过来写（先 `MARKER` 后 prompt）会把“prompt 失败”永久吞掉。收尾沉降为 `failed` 时吐 `warning` toast 且不重试。

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

固定提示词（中文，逐字使用，取自 `post-finish.ts:24-29` 的 `PROMPT`，附在 `prompt` 的 `text` 里）：

```text
你已越过 finished 边界。本轮只做一件事。
不要读任何文件：不读源码，不读 docs/architecture/INDEX.md，不读 area 或 module 文档。上一轮的上下文你已经有。
不要改代码、配置或脚本，不要跑 lint/typecheck/测试/构建，不要执行任何 git 命令。
在 docs/architecture/UNARCHIVED.md 追加恰好一个 delta 块，格式遵循根 AGENTS.md 的 Architecture Docs 段落：
task/source、受影响路径与符号、实际改动、验证证据（已有则写）。本任务已有块就更新它，不要加第二个。
只回一行：已归档，后面跟受影响路径。本轮确实没有值得暂存的内容，就只回 NO-DELTA。
```

## 7. 配置面

在 `packages/schema/src/config.ts`（`:86-94`，紧随 `auto_approve`）增加 fork 键 `post_finish`：

```ts
post_finish: Schema.Union([
  Schema.Boolean,
  Schema.Struct({ agents: Schema.Array(Schema.String).pipe(optional) }),
])
  .pipe(optional)
  .annotate({
    description:
      'After a subagent reports finished, one automatic follow-up appends its architecture delta to docs/architecture/UNARCHIVED.md. Defaults to on with ["coder"]; true is the default list, false disables it, or give agents to cover.',
  }),
```

- `true` / 缺省 → `["coder"]`；`false` → 关闭；对象 → `agents ?? ["coder"]`（`allowlist`，`post-finish.ts:163-167`）。**默认开启**：这是 fork 本地便利，不是安全边界；用户要的是“自动”，而不是“记得去开”。
- **必须在 `packages/core/src/config/normalize.ts:240` 登记**：`post_finish: Info.fields.post_finish`。漏了这一行，normalization 会把这个键直接丢掉——和 `auto_approve` 列在那里的原因相同。
- 生成的类型镜像在 `packages/client/src/promise/generated/types.ts`，由 `bun run generate` 产出，不手改。
- **`post_finish: false`** 是显式关闭方式；`Config.latest(yield* config.entries(), "post_finish")` 每次报告都重新读取，热重载即刻生效，无需重启。
- **只读代理永不在白名单**：`researcher`、`reviewer`、`explore`、`archivist` 是插件里硬编码的 `READ_ONLY` 集合，先于配置查询判断；`archivist` 本身就是合并方。白名单默认值固定为 `["coder"]`。
- `auto_approve` 采用 opt-in **不**是本键的模板：权限是安全边界，默认必须收紧；本键不是。

## 8. 失败模式

`docs/architecture/UNARCHIVED.md` 目前**没有**任何校验器、linter 或自动合并（`script/`、`.github/`、根 `package.json` 对 “UNARCHIVED” 零命中）。失败是静默的，这是本设计真正的风险来源。

| 失败模式 | 表现 | 缓解 |
| --- | --- | --- |
| 插件未加载 | 完全不触发 | 插件随 `post` 数组注册，随 Location 加载；加载前的窗口见下一行 |
| 订阅尚未生效时报告已发布 | 漏掉该次 delta | bus 是**纯实时**通道，无回放（`packages/core/src/bus.ts:134-138`）；接受为 best-effort |
| 子会话已被删除 | `prompt` 报 NotFound | 捕获为 warning，撤掉已写的标记；后续无报告则自然无收尾 |
| 写了 delta 但质量低 | 架构文档漂移 | archivist 仍会在合并时校验并改写，`UNARCHIVED.md` 本就是暂存区 |

**明确接受的边界**：本插件是 best-effort。收尾这一轮的沉降被静默（不回父级），所以父级**不会**再收到第二份 `<background-result>`；回执改为 `tui.toast.show`，只发给正在看这个目录的人类，没有 TUI 附着时是 no-op。因此“父级没看到”不再等于“没落地”——可见性由 toast 承担。不引入重试队列、不引入 outbox、不引入告警。

## 9. 验证计划（已执行）

工具链：Bun 1.4.4（把 `C:\Users\31087\AppData\Local\Temp\opencode\bun-1.4.4\bun-windows-x64` 前置到 PATH）；本地 bun 1.4.2 无法跑 `bun check`。已落地的门禁：

- `bun run check`：36/36 全绿。
- `bun run lint`：exit 0。
- `packages/core` 下 `bun run typecheck:tsc`：exit 0。
- `packages/core/test/post-finish.test.ts`：**14 pass**（11 个 `it.effect` 单测 + 3 个 `settlement.effect` 端到端）。
- `packages/core/test/subagent-report.test.ts`：**12 pass**，上游沉降契约未被改动。

测试全部在 `packages/core` 目录内执行（禁止在仓库根跑），遵循 `.opencode/skills/unit-tests/SKILL.md`：不打 `globalThis` 补丁、不复制实现逻辑进测试、用真实实现。覆盖的关键用例（单测）：

- (a) 一份 `completed` 报告 → 对该子会话恰好产生一次 follow-up prompt（steer，文本含 `UNARCHIVED.md` 与 `NO-DELTA`）；
- (b) 为子会话写静默标记且不丢其它 metadata，同时写 `postfinish-pending:<child>`；
- (c) follow-up 自身的 `completed` 报告 → 不再产生第二次 follow-up（`MARKER` 生效）；
- (d) `cancelled` → 不产生 follow-up，不写任何状态；
- (e) `prompt` 抛错 → 撤掉 `PENDING` 与静默标记，后续报告可重试；
- (f) 白名单外 agent、硬拒只读 agent、`post_finish: false`、缺省、`true`、热重载逐报告读取。

端到端（`settlement`）三例：(g) 收尾轮不进父级 inbox、且 toast 只发一次、标记被单次消费；(h) 收尾之后父级自己发起的一轮仍正常报告；(i) `failed` 收尾只 toast 一次且不重试。

**(g)(h)(i) 是承重用例**：实施时曾把 `prepare` 的新 disjunct 临时强制为 `false`，确认这三例失败后再恢复——它们真的在守护 seam，而不是空跑。

## 10. 实施顺序（已完成）

| # | 步骤 | commit |
| --- | --- | --- |
| 1 | `config.ts` 加 `post_finish` 键；`normalize.ts` 登记；重新生成 `client` 类型；新建 `post-finish.ts` 并在 `internal.ts` 的 `post` 数组注册；新建 `post-finish.test.ts` | `8901dc4205` |
| 2 | core seam：`subagent-report.ts` 静默 disjunct + 单次清标记；toast 回执；端到端测试 | `cee4bf4084` |
| 3 | 审计修复：`Database.Service` 缺失改为 loud fail；`Schema.Boolean` 取代 `Literal(false)` | `c36085bb25` |
| 4 | 由 Chief 在 `docs/architecture/UNARCHIVED.md` 追加本次改动的 delta | 待 Chief 提交 |

改动共 7 个文件（`git diff --stat 2b55bc5baf..HEAD`）：`config.ts`、`normalize.ts`、`post-finish.ts`、`internal.ts`、`subagent-report.ts`、`post-finish.test.ts`、`client/.../types.ts`。

## 11. 风险与未决

- **上游可能自带 post-finish hook**：若上游日后在沉降路径里提供等价能力，Z 应退役，改用上游机制，并删除本插件、`post_finish` 键**以及 `subagent-report.ts` 的那处 seam**。届时那 52 行要一并归还上游。
- **实时 bus 的加载窗口**：`ctx.event.subscribe` 生效前发表的报告无法补回（无回放）；插件加载晚于子会话沉降时会漏一次。
- **`state` 双源差异**：`metadata.state` 是原始 job 状态，XML `state` 属性可能被降级成 `running`（`packages/core/src/session/subagent-completion.ts:72-73,83`）。过滤器必须只看 metadata，任何解析 XML 文本的实现都是错的。
- **成本**：每个命中的子会话多消耗一次轻量 turn；白名单默认只有 `coder`，且每个子会话至多一次，接受。

已接受的实现局限（均已在代码注释里写明，见第 12 节）：

- **F2 静默窗口**：标记吞掉的是**下一个提交的沉降**，不是插件刚 admit 的那一轮。父级在“写 metadata”与“收尾轮 drain”之间发起的一次 follow-up 会被吞：它的报告丢失，而 toast 仍显示已归档。关闭窗口需要沉降携带 per-round token，代价高于窗口本身。
- **F6 替换语义**：`ctx.session.update` 替换整个公开 metadata map（`Session.setMetadata` 发布整张 map，`projector.ts:989-996` 整张写回），所以插件的 read-modify-write 可能丢掉另一个写者在此期间存的公开键。core 私有的 `$opencode_experimental_cwd` 因为 projector 重新读出并写回而幸存。插件拿不到 `Database.Service`，因此无法做 `json_set` 式局部 patch。
- **F4 不可行**：私有 `$opencode_…` 键在插件侧不可用——`session/info.ts:49` 把它从 `Session.Info.metadata` 剥掉，read-modify-write 会重建出没有它的 map 并把丢失持久化。要做需要 core 提供按键寻址的 metadata patch，或给插件一个 per-session store。

## 12. 实现与设计的偏差

| 偏差 | 原因 | 位置 |
| --- | --- | --- |
| 不是纯插件，出现一处 core seam | 若不静默，收尾轮的沉降会再报父级；静默必须在沉降自己的 `BEGIN IMMEDIATE` 事务里完成——插件在别的 fiber 清标记与下一次 `prepare` 无顺序保证 | `subagent-report.ts`（`prepare` 第三 disjunct、`SILENT_METADATA_KEY`、`postFinishSilent`、`clearPostFinishMark`，净 +52 行） |
| 新增 `tui.toast.show` 回执 | 收尾轮被静默后父级看不到它，必须让人知道“已归档”；否则失败完全静默 | `post-finish.ts`(settle)、`tui-event.ts:40-50`、`app.tsx:1402-1410` |
| 配置用 `Schema.Boolean` 而非 `Schema.Literal(false)` | `true` 需要等价于“缺省”（即 `["coder"]`），`Literal(false)` 无法表达 | `config.ts:86-94` |
| 设计中的 `REPORTED` 键被丢弃 | 与 `MARKER` 语义重叠且不可达——没有任何路径会先报再等，留下只会是死状态 | `post-finish.ts` |
| `Database.Service` 用 `serviceOption` + `getOrThrowWith` | `commit` 类型是 `Effect<void, never, never>`，必需服务会把 `R` 泄进闭包（`tsc` TS2345，`execution.ts:170`）；缺失必须是 loud defect，静默跳过会永久静默该子会话 | `subagent-report.ts:236-241` |
| 一个合并订阅而非两个 | bus 在单订阅内保持跨类型顺序，保证原始 completed 先于其沉降被处理；两个订阅会反向竞争 | `post-finish.ts:136-144` |
| 另加一行 `normalize.ts` | 未登记的键会被 normalization 丢弃（与 `auto_approve` 同因） | `normalize.ts:240` |
| 另加生成类型镜像 | 改公共 config 面后须 `bun run generate`，不手改 | `client/src/promise/generated/types.ts` |
