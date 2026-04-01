# MCP Server 使用指南

OpenMedKit 内置了一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，通过 stdio 传输协议暴露药箱的增删改查操作。任何支持 MCP 的 AI 客户端（Claude Code、Cursor、Claude Desktop、OpenClaw 等）都可以直接调用这些 tool 来管理你的家庭药箱数据，无需打开网页。

如果你完全不打开 Web UI、只通过 MCP 使用 OpenMedKit，请特别注意先初始化“业务时区”。未初始化时，系统会回退到 `UTC`，不会使用服务器本地时区。

---

## 前置条件

- Node.js >= 20
- 已 clone 项目并执行过 `npm install`

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
npm install
```

> MCP Server 直接读写 SQLite 数据库，和 Web UI 共享同一份数据（WAL 模式支持并发访问）。不需要启动 HTTP 服务器。
>
> **注意**：`DB_PATH` 必须和 Web UI 指向同一个数据库文件。开发模式下 `npm run dev` 的 backend 工作目录是 `backend/`，默认数据库在 `backend/data/medicine.db`；MCP 进程的工作目录通常是项目根目录，因此需要写成 `./backend/data/medicine.db`。

---

## 首次使用：先初始化时区

OpenMedKit 会把“今天是几号”“哪些药算快过期”“每天几点发提醒”这些业务日期统一按一个**业务时区**来计算。

- 如果你先打开过 Web UI：应用会自动检测浏览器时区并保存到服务端
- 如果你只通过 MCP 使用：请在第一次连接后主动初始化

推荐流程：

```text
1. 先运行 get_settings
2. 如果看到 configured: false
3. 再运行 set_timezone(timezone="Asia/Shanghai")
```

未初始化时，MCP 会明确提示当前只是回退到 `UTC`。

---

## 在 Claude Code 中使用

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 原生支持 MCP。

### 方式一：项目级配置（推荐）

在项目根目录创建或编辑 `.mcp.json`：

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "npx",
      "args": ["tsx", "backend/src/mcp-server.ts"],
      "env": {
        "DB_PATH": "./backend/data/medicine.db"
      }
    }
  }
}
```

之后在项目目录下启动 Claude Code，MedKit MCP 会自动加载：

```bash
claude
```

### 方式二：全局配置

编辑 `~/.claude/mcp.json`（对所有项目生效）：

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "node",
      "args": ["/absolute/path/to/open-medkit/backend/dist/mcp-server.js"],
      "env": {
        "DB_PATH": "/absolute/path/to/open-medkit/backend/data/medicine.db"
      }
    }
  }
}
```

> 全局配置需要先构建：`npm run build`。构建后使用 `node` + `dist/mcp-server.js`，无需 tsx。

### 验证

启动 Claude Code 后，输入 `/mcp` 查看已连接的 MCP 服务器列表，确认 `medkit` 出现且状态正常。

然后可以直接用自然语言操作药箱：

```
> 帮我查一下药箱里有哪些药快过期了

> 添加一个药品：布洛芬缓释胶囊 300mg，有效期到2027年6月，还剩20粒，放在药箱A层

> 把 id 为 3 的药品数量改成 10 粒

> 药箱统计看看
```

---

## 在 OpenClaw / Codex 中使用

OpenClaw 和 Codex CLI 的 Skill 系统通过 `SKILL.md` + MCP 工具来扩展 agent 能力。

### 方式一：在 Codex 项目中配置 MCP

编辑项目根目录的 `codex.json` 或 `~/.codex/config.json`：

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "npx",
      "args": ["tsx", "/path/to/open-medkit/backend/src/mcp-server.ts"],
      "env": {
        "DB_PATH": "/path/to/open-medkit/backend/data/medicine.db"
      }
    }
  }
}
```

### 方式二：创建 Skill

在你的 Codex 技能目录（如 `~/.codex/skills/medkit/`）中创建 `SKILL.md`：

```markdown
# MedKit 药箱管理

管理家庭药箱的药品数据。当用户提到药品管理、药箱查询、添加药品、查看过期药品等操作时使用。

## 可用 MCP 工具

连接到 `medkit` MCP 服务器后，你可以使用以下工具：

- `get_settings` — 查看当前业务时区是否已初始化
- `set_timezone` — 初始化或更新业务时区
- `list_medicines` — 列出药品，支持按分类、过期状态、名称筛选
- `get_medicine` — 按 ID 查看单个药品详情
- `add_medicine` — 添加药品（只需提供 name，其他字段可选）
- `update_medicine` — 按 ID 更新药品信息（只需传要改的字段）
- `delete_medicine` — 按 ID 删除药品
- `get_stats` — 查看药箱统计（总数、已过期、即将过期、状态良好、分类分布）
- `search_medicines` — 按关键词搜索药品（搜索名称、用途、备注）

## 操作指南

- 用户说「先把时区设成上海时间」→ 调用 `set_timezone`
- 用户说「看一下时区有没有配」→ 调用 `get_settings`
- 用户说「加个药」→ 从描述中提取字段，调用 `add_medicine`
- 用户问「有退烧药吗」→ 调用 `search_medicines`，query 传 "退烧"
- 用户说「看看快过期的」→ 调用 `list_medicines`，status 传 "expiring"
- 用户说「药箱概况」→ 调用 `get_stats`

## 药品字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| name | 药品名称（必填） | 布洛芬缓释胶囊 |
| name_en | 英文名 | Ibuprofen SR Capsules |
| spec | 规格 | 300mg/粒 |
| quantity | 剩余数量 | 20粒 |
| expires_at | 有效期（YYYY-MM-DD） | 2027-06-30 |
| category | 分类 | 感冒发烧 |
| usage_desc | 用途/适应症 | 退烧、止痛、抗炎 |
| location | 存放位置 | 药箱 A层 |
| notes | 备注 | 饭后服用 |
```

---

## 在 Cursor 中使用

编辑 `~/.cursor/mcp.json`（全局）或项目中的 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "npx",
      "args": ["tsx", "backend/src/mcp-server.ts"],
      "cwd": "/path/to/open-medkit",
      "env": {
        "DB_PATH": "./backend/data/medicine.db"
      }
    }
  }
}
```

配置后重启 Cursor，在聊天中即可直接操作药箱数据。

---

## 在 Claude Desktop 中使用

编辑 Claude Desktop 配置文件：

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-medkit": {
      "command": "node",
      "args": ["/absolute/path/to/open-medkit/backend/dist/mcp-server.js"],
      "env": {
        "DB_PATH": "/absolute/path/to/open-medkit/backend/data/medicine.db"
      }
    }
  }
}
```

> Claude Desktop 需要使用构建后的文件。先执行 `npm run build`。

重启 Claude Desktop，在对话框左下角的工具图标中确认 `medkit` 已连接。

---

## 可用工具一览

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_settings` | 查看当前与 MCP 使用相关的设置，尤其是业务时区是否已初始化 | 无 |
| `set_timezone` | 初始化或更新业务时区 | `timezone` IANA 时区，例如 `Asia/Shanghai`、`America/New_York` |
| `list_medicines` | 列出药品，支持筛选 | `category?` 分类名, `status?` "expired"/"expiring"/"ok", `search?` 名称模糊搜索, `expiring_days?` 即将过期天数阈值（默认 30） |
| `get_medicine` | 按 ID 获取单条药品 | `id` 药品 ID |
| `add_medicine` | 添加药品（name 不能为空） | `name` (必填), `name_en?`, `spec?`, `quantity?`, `expires_at?`, `category?`, `usage_desc?`, `location?`, `notes?` |
| `update_medicine` | 更新药品（仅更新传入的字段，name 不能为空白） | `id` (必填) + 同 add_medicine 的可选字段 |
| `delete_medicine` | 删除药品 | `id` 药品 ID |
| `get_stats` | 药箱统计概览 | `expiring_days?` 即将过期天数阈值（默认 30） |
| `search_medicines` | 关键词搜索 | `query` 搜索关键词 |

## 可用资源

| URI | 说明 |
|-----|------|
| `medkit://settings` | 当前业务时区状态（是否已初始化、当前使用哪个时区） |
| `medkit://medicines` | 全量药品数据 (JSON) |
| `medkit://stats` | 统计摘要 (JSON)，支持 `?expiring_days=N` 自定义即将过期阈值（默认 30 天） |

---

## 典型对话示例

以下示例适用于所有支持 MCP 的客户端：

### 初始化时区

```text
用户: 先帮我把药箱时区设成上海时间

Agent 调用: set_timezone({
  timezone: "Asia/Shanghai"
})
```

```text
用户: 看一下现在药箱是不是已经配置时区了

Agent 调用: get_settings()
```

### 添加药品

```
用户: 帮我加个药 — 对乙酰氨基酚片 500mg，有效期 2027年5月，还有24片，放在药箱A层，感冒发烧用的

Agent 调用: add_medicine({
  name: "对乙酰氨基酚片",
  spec: "500mg/片",
  quantity: "24片",
  expires_at: "2027-05-31",
  location: "药箱 A层",
  category: "感冒发烧",
  usage_desc: "退烧、止痛，适用于普通感冒、头痛、牙痛"
})
```

### 查询过期药品

```
用户: 有没有快过期的药？

Agent 调用: list_medicines({ status: "expiring" })
```

### 搜索药品

```
用户: 有治头疼的药吗？

Agent 调用: search_medicines({ query: "头痛" })
// 如果没有结果，可以尝试:
Agent 调用: search_medicines({ query: "止痛" })
```

### 更新数量

```
用户: 创可贴用了几片，还剩大约15片

Agent 调用: search_medicines({ query: "创可贴" })
// 找到 id 后:
Agent 调用: update_medicine({ id: 3, quantity: "约15片" })
```

### 查看统计

```
用户: 药箱里有多少药？

Agent 调用: get_stats()
```

---

## 生产环境构建

开发环境使用 `tsx` 直接运行 TypeScript 源码。生产环境建议先构建再使用：

```bash
npm run build
```

构建后将 `node` + `backend/dist/mcp-server.js` 替换配置中的 `npx tsx` 命令。

---

## 故障排查

### MCP 服务器未显示 / 连接失败

1. 确认 `npm install` 已执行且无错误
2. 确认 `DB_PATH` 指向有效路径（目录需要存在，数据库文件会自动创建）
3. 手动测试 MCP 服务器：
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx tsx backend/src/mcp-server.ts 2>/dev/null
   ```
   正常应返回包含 `"serverInfo":{"name":"medkit"}` 的 JSON 响应。

### 数据不同步

MCP 服务器和 Web UI 共享同一个 SQLite 文件。如果数据看起来不一致：

1. 确认两者的 `DB_PATH` 指向同一个文件
2. SQLite WAL 模式下极少出现冲突，如遇到锁定问题，等待几秒后重试

### 路径问题

- 开发模式下使用相对路径时，`DB_PATH` 相对于 MCP 进程的工作目录
- 生产模式建议使用绝对路径
