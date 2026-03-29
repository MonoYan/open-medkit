import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

import { getDb } from './db/client';
import { aiRouter } from './routes/ai';
import { medicinesRouter } from './routes/medicines';
import { notificationsRouter } from './routes/notifications';
import { startNotificationScheduler } from './services/notifier';

const app = new Hono();

function loadProjectEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      process.loadEnvFile(candidate);
      return;
    } catch (error) {
      console.warn(
        `Failed to load env file at ${candidate}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

loadProjectEnv();

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Using proxy: ${proxyUrl}`);
}

const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

getDb();

function getFrontendDistPath() {
  const candidates = [
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), './frontend/dist'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function getContentType(filePath: string) {
  const extension = path.extname(filePath);

  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function serveFile(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return new Response(buffer, {
    headers: {
      'Content-Type': getContentType(filePath),
    },
  });
}

app.use('*', cors());

app.route('/api/medicines', medicinesRouter);
app.route('/api/ai', aiRouter);
app.route('/api/notifications', notificationsRouter);

if (isProduction) {
  const frontendDist = getFrontendDistPath();
  const indexFile = path.join(frontendDist, 'index.html');

  app.get('/assets/*', async (c) => {
    try {
      const relativePath = c.req.path.replace(/^\//, '');
      const filePath = path.join(frontendDist, relativePath);
      return await serveFile(filePath);
    } catch {
      return c.notFound();
    }
  });

  app.get('/*', async (c) => {
    try {
      const relativePath = c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\//, '');
      const filePath = path.join(frontendDist, relativePath);

      if (existsSync(filePath)) {
        return await serveFile(filePath);
      }

      return await serveFile(indexFile);
    } catch {
      return c.json({ error: 'Not Found' }, 404);
    }
  });
}

app.notFound(async (c) => {
  if (isProduction && !c.req.path.startsWith('/api/')) {
    const indexFile = path.join(getFrontendDistPath(), 'index.html');

    if (existsSync(indexFile)) {
      return serveFile(indexFile);
    }
  }

  return c.json({ error: 'Not Found' }, 404);
});

serve({
  fetch: app.fetch,
  port,
});

startNotificationScheduler();
console.log(`MedKit server running on port ${port}`);
