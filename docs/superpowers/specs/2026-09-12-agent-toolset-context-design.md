# Agent 工具上下文隔离 + TUI `/agents` 可视化管理 — 设计文档

> 状态:待评审
> 日期:2026-09-12
> 基线:`dev` 分支
> 关联:`ARCHITECTURE.md`、`ANALYSIS-AND-REFACTORING.md`

## 1. 背景与目标

当前 OpenCode 在组装一次模型请求时,会把**所有**内置工具和**所有**已连接 MCP server 的工具都放进工具的上下文,无论当前 agent 是谁:

- 内置工具:`packages/opencode/src/tool/registry.ts:291` 的 `tools()` 只按模型能力(`patch`/`edit`/`websearch`)过滤,不按 agent 过滤。
- MCP 工具:`packages/opencode/src/session/tools.ts:390` 无条件遍历 `mcp.tools()` 把全部 MCP 工具加入。
- `Agent.Info`(`packages/opencode/src/agent/agent.ts:35`)只有 `permission`(allow/deny/ask),`permission` 只在**执行时**拦截,工具定义仍然占用上下文。

结果是:无关工具挤占上下文、增加成本、污染模型决策。

**本设计目标**

1. **运行时:按 agent 隔离工具上下文** —— 每个 agent 声明一个 `toolset` 可见性白名单,只有匹配的工具会发给模型。
2. **TUI:`/agents` 可视化管理** —— 在运行中的 TUI 会话里创建/编辑/删除 agent 的 `toolset`、模型、权限、MCP 挂载,无需手改 JSON。

## 2. 非目标(Out of Scope)

- 不修改 server / protocol / codegen(复用 legacy 配置接口)。
- 不改 markdown agent 文件(`.opencode/agents/*.md`)的读写;本次只写 `opencode.json` 的 `agent` 块。
- 不做 subagent 生命周期重构(`task` 工具保持现状)。
- 不改变顶层 `config.tools` 字段语义(它仍是 deprecated 的 permission 别名)。
- 不实现 agent 的 MCP server 连接管理(仍由 `opencode mcp` / `config.mcp` 负责);TUI 只做"把已有 MCP 工具挂到 agent"。

## 3. 关键事实(实现依据)

| 事实 | 位置 |
|---|---|
| TUI 的 `/agents` 命令已存在,仅切换当前 agent | `packages/tui/src/app.tsx:678`,`packages/tui/src/component/dialog-agent.tsx` |
| TUI 是纯客户端,agent/config 只读 | `packages/tui/src/context/sync.tsx:468-511` |
| SDK v2 已提供 `config.get` / `config.update` / `global.config.update` / `experimental.tool.ids` / `app.agents` | `packages/sdk/js/src/v2/gen/sdk.gen.ts` |
| 写配置会触发 `Config.invalidate()` | `packages/opencode/src/config/config.ts:652-680` |
| 配置 `agent` 块支持 `disable: true` 删除 agent | `packages/opencode/src/agent/agent.ts:268` |
| MCP 工具命名 = `sanitize(server) + "_" + sanitize(tool)` | `packages/opencode/src/mcp/catalog.ts:117-119` |
| 权限 glob 匹配器可复用 | `packages/opencode/src/permission`(`Permission.evaluate`) |
| TUI 无通用表单组件,现有 `DialogSelect` / `DialogPrompt` / `DialogConfirm` | `packages/tui/src/ui/` |

## 4. Part 1 — 运行时 `toolset` 可见性

### 4.1 数据模型

在 agent 配置新增字段:

```jsonc
{
  "agent": {
    "research": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4",
      "toolset": {
        "*": false,
        "read": true,
        "grep": true,
        "glob": true,
        "github_*": true,     // 按 MCP 工具 key 匹配
        "mcp:linear": true    // 匹配 linear server 的全部工具
      }
    }
  }
}
```

**语义**

- `toolset` 缺省 → 全部工具可见(向后兼容,现有行为不变)。
- `toolset` 存在 → 白名单模式。工具可见当且仅当:匹配任一值为 `true` 的 glob,且不匹配任何值为 `false` 的 glob(`false` 优先级更高)。
- 匹配目标:
  - 内置工具:`tool.id`(如 `bash`、`read`、`task`)。
  - MCP 工具:工具 key(如 `github_create_issue`),以及合成的 `mcp:<server>` 形式(匹配该 server 的所有工具)。
- glob 匹配复用 permission 的匹配器,保证与现有 `permission` 语法一致。

### 4.2 Schema 改动

| 文件 | 改动 |
|---|---|
| `packages/core/src/v1/config/agent.ts` | `AgentSchema` 增加 `toolset: Schema.optional(Schema.Record(Schema.String, Schema.Boolean))`;加入 `KNOWN_KEYS`;`normalize` 中透传 |
| `packages/opencode/src/config/v2-compat.ts` | v2 `Agent` struct(约 `:63`)增加 `toolset`;`lowerAgent`(约 `:396`)透传 |
| `packages/opencode/src/agent/agent.ts` | `Agent.Info`(约 `:35`)增加 `toolset`;配置合并循环(约 `:267`)拷贝 `value.toolset` |
| `packages/schema/src/agent.ts` | (可选)wire `Agent.Info` 增加 `toolset`,供未来客户端展示;若仅 TUI 编辑,读原始 `config.agent` 即可,可省 |

**内置 agent 默认值**(`packages/opencode/src/agent/agent.ts`):

- `build` / `general` / `plan`:不设 `toolset`(全可见),行为不变。
- `explore`:显式设置只读工具白名单(与现有 permission 语义一致,额外减少上下文)。
- 未在配置里声明 `toolset` 的用户自定义 agent:不设,保持全可见。

### 4.3 过滤点

**内置工具** —— `packages/opencode/src/tool/registry.ts:291` `tools()`:

在现有 `filtered`(模型能力过滤)之后,再按 `input.agent.toolset` 过滤一次。保持返回结构不变。

**MCP 工具** —— `packages/opencode/src/session/tools.ts:390`:

遍历 `mcp.tools()` 时,若 `agent.toolset` 存在且该工具 key(及其 `mcp:<server>`)不匹配白名单,则 `continue`。

**MCP resource 工具** —— `packages/opencode/src/session/tools.ts:139`:

`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` 同样按 `toolset` 过滤(用 `mcp:<server>` 或工具名匹配)。

**权限不变**:`permission` 仍独立控制执行授权;`toolset` 只控制"是否进入上下文"。两者正交。若工具可见但被 permission 拒绝,行为与现在一致(执行时 ask/deny)。

### 4.4 边界

- `task` 工具的可用 subagent 列表(`describeTask`)由 `permission` 决定,不受 `toolset` 影响。
- code-mode 的 `execute` 工具目录(`describeCodeMode`)应使用同一份 `toolset` 过滤后的工具集,避免泄露被隐藏的工具。

## 5. Part 2 — TUI `/agents` 管理对话框

### 5.1 命令接线

修改 `packages/tui/src/app.tsx:678` 的 `agent.list` 命令:

- `run` 从 `dialog.replace(() => <DialogAgent />)` 改为 `dialog.replace(() => <DialogAgentManage />)`。
- 保留 `slashName: "agents"`。
- 切换当前 agent 的能力保留在管理对话框的每行 action 里(见下)。

### 5.2 组件

新增 `packages/tui/src/component/dialog-agent-manage.tsx`:

- 主列表(`DialogSelect`):
  - 顶部固定行 `+ Create new agent`。
  - 其后每个 agent 一行,展示名称、mode、当前 model。
  - 每行 actions:`Switch to`(primary/all 可用)、`Edit`、`Delete`。
- 选中 `Create new` → 先 `DialogPrompt.show` 输入 name,再进入编辑面板。
- `Delete` → `DialogConfirm` 确认后,写 `agent[name] = { disable: true }`。

新增 `packages/tui/src/component/dialog-agent-edit.tsx`(字段化编辑面板):

- 用 `DialogSelect` 列出可编辑字段,选中字段进入对应子对话框:
  - `description`:`DialogPrompt`。
  - `mode`:`DialogSelect`(all / primary / subagent)。
  - `model`:`DialogSelect`(复用 `DialogModel` 的数据源 / 现有模型列表逻辑)。
  - `toolset`:多选,选项 = `experimental.tool.ids` 的工具 id + MCP server(`mcp:<server>` 形式,来自 `sync.data.mcp`)。两种模式:「全可见」= 不写 `toolset` 字段;「白名单」= 写 `toolset` record(默认 `"*": false`,勾选项置 `true`)。
  - `permission`:多选,复用 `packages/opencode/src/cli/cmd/agent.ts:19` 的权限键集合。
  - `scope`:project / global(决定写哪份配置)。
- 底部显示 `Save` / `Cancel`。

### 5.3 持久化

- project scope:`sdk.client.config.update({ agent: { [name]: patch } })`。
- global scope:`sdk.client.global.config.update({ agent: { [name]: patch } })`。
- patch 只包含本次修改的字段;服务端 `mergeDeep` 合并,`Config.invalidate()` 自动触发。
- 删除:`{ disable: true }`(merge 兼容,`agent.ts:268` 会剔除该 agent)。

### 5.4 刷新

保存后调用 `sdk.client.app.agents()` 并把结果写入 `sync.data.agent`(`packages/tui/src/context/sync.tsx:468-511` 已有同样的加载逻辑,抽出复用),使 `local.agent` 立即反映变更。

## 6. 测试

**单元测试**

- `toolset` glob 匹配:无 `toolset` 全可见;`true`/`false` 优先级;`mcp:<server>` 前缀匹配;通配符。
- agent 配置解析:`toolset` 经 `ConfigAgentV1.Info` 与 v2-compat 后保留。
- `registry.tools()` / `SessionTools.resolve()` 在给定 `toolset` 时返回预期工具集合。

**手动验证**

- 在 TUI 建一个 `toolset` 只含 `read`/`grep` 的 agent,切换过去,确认模型侧工具列表只剩这两个。
- 编辑已有 agent 的 `toolset` 后立即生效(无需重启)。

## 7. 风险与开放问题

- **上下文收益的量化**:需要在实现后测量 token 变化(可选,不阻塞)。
- **`toolset` 与 `permission` 的双重配置心智负担**:文档需明确"可见性 vs 授权"的区别。
- **MCP 工具动态性**:MCP server 未连接时工具 id 未知;白名单用 glob/`mcp:<server>` 可规避。多选 UI 只展示当前已连接的 server,未连接的 server 需允许手动输入。
- **删除语义**:`disable: true` 会保留一条禁用记录,而非物理删除;若需要物理删除需直接编辑 JSONC,本次不做。

## 8. 文件清单

**Part 1**
- `packages/core/src/v1/config/agent.ts`
- `packages/opencode/src/config/v2-compat.ts`
- `packages/opencode/src/agent/agent.ts`
- `packages/schema/src/agent.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/session/tools.ts`

**Part 2**
- `packages/tui/src/app.tsx`
- `packages/tui/src/component/dialog-agent-manage.tsx`(新增)
- `packages/tui/src/component/dialog-agent-edit.tsx`(新增)
- `packages/tui/src/context/sync.tsx`(抽出 agent 刷新逻辑)
