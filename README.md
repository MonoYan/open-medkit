<div align="center">

# Open MedKit

**对着药箱说句话，剩下的交给 AI。**

家庭药箱管理工具 — 自然语言录入 · AI 结构化解析 · 过期自动提醒

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](./DEPLOY.md)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)]()

</div>

---

<div align="center">

![AI 检索页面](.docs/screenshot/chat-page.png)

</div>

### Why Open MedKit

家里的药总是找不到、忘了过期、想不起来有没有。Open MedKit 让你用**一句话**把药品录入药箱，用**一句话**从药箱里找药。没有复杂的表单，没有手动归类 —— AI 搞定一切，你只管说。

### Highlights

| | |
|:---|:---|
| **说一句话就入库** | 自然语言描述药品 → AI 提取名称、规格、有效期等全部字段，确认即入库 |
| **换行分隔批量录** | 多条药品换行粘贴，一键批量解析，适合首次整理一整箱药 |
| **问一句话就找药** | 「有退烧药吗」「快过期的有哪些」—— 像聊天一样检索药箱 |
| **过期自动提醒** | 到期 / 即将到期药品自动标记高亮，支持 Telegram 每日推送 |
| **一行命令自部署** | `docker compose up -d`，药箱数据默认保存在本地 SQLite；启用 AI/Telegram 时仅与对应服务通信 |
| **兼容任意 AI** | OpenAI、Deepseek、Ollama…… 任何兼容 `/v1/chat/completions` 的 API 均可 |

### See it in action

<details>
<summary><b>AI 智能录入演示</b> — 说一句话，自动解析入库</summary>
<br>
<div align="center">

![AI 解析录入演示](.docs/screenshot/add-demo.gif)

</div>
</details>

<details open>
<summary><b>药品列表</b> — 分类筛选 · 过期状态一目了然</summary>
<br>
<div align="center">

![药品列表页面](.docs/screenshot/list-page.png)

</div>
</details>

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS v3 |
| Backend | Hono (Node adapter) · TypeScript |
| Database | SQLite via better-sqlite3 |
| AI | Any OpenAI-compatible API (`/v1/chat/completions`) |
| Deploy | Single Docker container |

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
cp .env.example .env
# Edit .env — set your AI_API_KEY at minimum
docker compose up -d
```

Open http://localhost:3000.

### Local Development

Prerequisites: Node.js >= 20

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
npm install
cp .env.example .env
npm run dev
```

Frontend runs on http://localhost:5173, backend on http://localhost:3000.

## Configuration

All AI config can also be set in the browser Settings panel. Values entered there are stored in the current browser's `localStorage` and take priority over env vars.

| Env Variable | Default | Description |
|---|---|---|
| `AI_API_KEY` | — | OpenAI-compatible API key |
| `AI_BASE_URL` | `https://api.openai.com` | API base URL |
| `AI_MODEL` | `gpt-4o-mini` | Model name |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./data/medicine.db` | SQLite database path |

## Privacy & Safety

- Medicine records are stored in the SQLite database inside your deployment by default.
- AI parse, image recognition, and chat features send the submitted text or image to the OpenAI-compatible endpoint you configure.
- AI chat also sends the current medicine inventory needed to answer your question, so avoid entering data you do not want to share with that model provider.
- Browser-level AI settings such as `AI_API_KEY`, base URL, and model name are stored in the current browser's `localStorage`.
- Telegram reminders send medicine names, expiry dates, and reminder text to Telegram once that channel is enabled.
- Open MedKit is for household inventory organization only and does not provide diagnosis, prescribing, or individualized medication advice.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for detailed deployment guide.

**TL;DR** — any machine that runs Docker:

```bash
docker compose up -d
```

Data is persisted in a Docker volume (`medkit-data`). To back up:

```bash
docker cp medkit:/data/medicine.db ./medicine-backup.db
```

## Project Structure

```
open-medkit/
├── backend/           # Hono API server
│   └── src/
│       ├── ai/        # AI client, prompts, parsing logic
│       ├── db/        # SQLite schema & client
│       ├── routes/    # REST API routes
│       ├── services/  # Notification scheduler
│       └── middleware/ # API key injection
├── frontend/          # React SPA
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── lib/       # API client & utils
│       └── types/
├── Dockerfile         # Multi-stage build
├── docker-compose.yml
└── .env.example
```

## License

MIT
