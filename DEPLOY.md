# Deployment Guide

## Docker Compose (recommended)

最简部署方式，适用于任何安装了 Docker 的机器（VPS、NAS、本地服务器等）。

### 1. Clone & Configure

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
cp .env.example .env
```

Edit `.env`:

```env
# 访问密码（可选；两个变量都留空则不启用）
# 推荐：使用 `npm run hash-password -w backend` 生成哈希
AUTH_PASSWORD_HASH=
# 或使用明文进行局域网快速部署（不建议用于公网访问）
# AUTH_PASSWORD=my-secret

AI_API_KEY=sk-your-key-here
AI_BASE_URL=https://api.openai.com   # or any OpenAI-compatible endpoint
AI_MODEL=gpt-4o-mini
MEDKIT_PORT=3000
# HTTPS_PROXY can still use http://proxy-host:port here; that is the proxy protocol, not the target site's protocol.
# HTTP_PROXY: use for HTTP targets
# HTTP_PROXY=http://192.168.31.1:7890
# HTTPS_PROXY: use for HTTPS targets
# HTTPS_PROXY=http://192.168.31.1:7890
# NO_PROXY: bypass proxy for local / internal hosts
# NO_PROXY=localhost,127.0.0.1,.local
```

> **Note**: AI config is optional at deploy time. Users can configure it later in the browser Settings panel.
> `MEDKIT_PORT` only changes the host port exposed by Docker Compose. The container still listens on `3000`.

### 2. Start

```bash
docker compose up -d --build
```

App is now running at `http://your-server-ip:3000` by default. If you changed `MEDKIT_PORT`, use that host port instead.

### 3. Update

```bash
git pull
docker compose up -d --build
```

### 4. Data Management

Database is stored in a Docker volume (`medkit-data`).

**Backup:**

```bash
# Copy database out of container
docker cp medkit:/data/medicine.db ./medicine-backup-$(date +%Y%m%d).db
```

**Restore:**

```bash
docker cp ./medicine-backup.db medkit:/data/medicine.db
docker compose restart
```

**Or use the built-in export/import** — open Settings in the web UI, click "Export Data" to download a JSON file. Import it on another instance.

---

## Reverse Proxy (HTTPS)

Production deployments should sit behind a reverse proxy for HTTPS.

### Nginx

```nginx
server {
    listen 80;
    server_name medkit.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name medkit.example.com;

    ssl_certificate     /etc/letsencrypt/live/medkit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/medkit.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy (simpler)

```
medkit.example.com {
    reverse_proxy localhost:3000
}
```

Caddy handles HTTPS certificates automatically.

---

## Synology NAS

1. Open **Container Manager** (Docker)
2. In **Project**, create a new project from the cloned repo folder
3. Set environment variables in the compose UI
4. Map volume: `/data` → a local folder on your NAS for persistence
5. Start the project

---

## Custom Port

For Docker Compose, set `MEDKIT_PORT` in `.env`:

```env
MEDKIT_PORT=8080
```

This changes the host port only; the container still listens on `3000`.

Or set `PORT` env var if running without Docker:

```bash
PORT=8080 npm run start
```

---

## Build from Source (no Docker)

For environments where Docker is not available.

### Prerequisites

- Node.js >= 20
- npm >= 9

### Steps

```bash
git clone https://github.com/MonoYan/open-medkit.git
cd open-medkit
npm install

# Build frontend and backend
npm run build

# Set env vars
export AI_API_KEY=sk-your-key
export DB_PATH=/path/to/medicine.db
export NODE_ENV=production
# 可选：启用访问密码保护
# export AUTH_PASSWORD_HASH='$argon2id$...'

# Start
npm run start
```

The server runs on port 3000 by default and serves both the API and frontend static files.

### Process Manager (systemd)

To keep the app running as a service:

```ini
# /etc/systemd/system/medkit.service
[Unit]
Description=Open MedKit
After=network.target

[Service]
Type=simple
User=medkit
WorkingDir=/opt/open-medkit/backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=DB_PATH=/opt/open-medkit/data/medicine.db
Environment=AI_API_KEY=sk-your-key

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now medkit
```

### Process Manager (pm2)

```bash
npm install -g pm2
cd backend
DB_PATH=/path/to/medicine.db AI_API_KEY=sk-your-key pm2 start dist/index.js --name medkit
pm2 save
pm2 startup
```

---

## 密码保护

MedKit 支持使用一个共享密码来保护访问。启用后，所有 API 路由和 Web UI 都需要先登录。

### 生成密码哈希

```bash
# 在项目根目录执行
npm run hash-password -w backend

# 或直接传入密码（安全性较低，会出现在 shell 历史中）
npm run hash-password -w backend -- "my-secret-password"
```

将输出结果（以 `$argon2id$...` 开头）填入 `.env`：

```env
AUTH_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=4$...
```

### 明文密码方案（仅限局域网）

如果只是为了快速在局域网中使用，也可以直接使用明文密码：

```env
AUTH_PASSWORD=my-secret
```

服务端启动时会打印警告，建议你改用哈希形式。

### 优先级

- `AUTH_PASSWORD_HASH` 的优先级高于 `AUTH_PASSWORD`
- 两者都为空时，不启用认证（保持向后兼容）

### 登录限流

登录接口带有限流：连续失败 5 次后会锁定 15 分钟。限流键使用 TCP socket 地址。若部署在反向代理后，应用看到的通常是代理的 IP，因此限流会按代理生效，而不是按真实客户端生效。这样做更保守，能阻止暴力破解，但也意味着单个攻击者可能让所有用户一起被锁。公网部署时，请同时在反向代理层增加限流。

---

## 公网安全

**不建议只靠内置密码就将 MedKit 直接暴露到公网。** 公开登录入口配合单个共享密码，对暴力破解的抵抗能力有限。

如果需要公网访问，建议按以下分层方式部署：

1. **必须**：容器只绑定到本机回环地址，例如在 `docker-compose.yml` 中使用 `127.0.0.1:3000:3000`
2. **必须**：通过反向代理（Nginx/Caddy）提供 HTTPS
3. **必须**：使用 `AUTH_PASSWORD_HASH`，不要使用明文密码
4. **强烈建议**：在代理层再加一层认证，例如 Basic Auth、IP 白名单或 Zero Trust（Cloudflare Access、Tailscale Funnel 等）
5. **强烈建议**：在代理层增加限流（例如 Nginx 的 `limit_req`）

内置密码主要面向可信局域网场景；如果开放公网访问，务必再增加第二层防护。

---

## Health Check

容器内置了 `/api/health` 健康检查接口（无需认证）。你也可以把它用于外部监控：

```bash
curl -f http://localhost:3000/api/health
```

服务正常时会返回 `200 {"status":"ok"}`。

---

## Telegram Notifications

Open MedKit supports Telegram bot notifications for expiring medicines.

1. Create a bot via [@BotFather](https://t.me/BotFather), get the bot token
2. Open Settings in the web UI → Notification Channels → Add Telegram
3. Paste the bot token, then click the link to start a chat with your bot
4. The app will auto-detect your chat ID

The bot sends daily reminders about medicines that are expired or expiring soon.
