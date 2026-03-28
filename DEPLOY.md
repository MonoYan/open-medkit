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
AI_API_KEY=sk-your-key-here
AI_BASE_URL=https://api.openai.com   # or any OpenAI-compatible endpoint
AI_MODEL=gpt-4o-mini
```

> **Note**: AI config is optional at deploy time. Users can configure it later in the browser Settings panel.

### 2. Start

```bash
docker compose up -d
```

App is now running at http://your-server-ip:3000.

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

Change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # host:container
```

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

## Health Check

The container includes a built-in health check. You can also use it for external monitoring:

```bash
curl -f http://localhost:3000/api/medicines/stats
```

Returns `200` with stats JSON when healthy.

---

## Telegram Notifications

Open MedKit supports Telegram bot notifications for expiring medicines.

1. Create a bot via [@BotFather](https://t.me/BotFather), get the bot token
2. Open Settings in the web UI → Notification Channels → Add Telegram
3. Paste the bot token, then click the link to start a chat with your bot
4. The app will auto-detect your chat ID

The bot sends daily reminders about medicines that are expired or expiring soon.
