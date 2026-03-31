import crypto from 'node:crypto';

const WEBHOOK_URL_PATTERN = /^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/.+$/;

interface FeishuResponse {
  code: number;
  msg: string;
}

export function isValidWebhookUrl(url: string): boolean {
  return WEBHOOK_URL_PATTERN.test(url);
}

function genSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto
    .createHmac('sha256', stringToSign)
    .update('')
    .digest('base64');
}

async function postWebhook(
  webhookUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Feishu API error (${response.status}): ${text}`);
  }

  const result = (await response.json()) as FeishuResponse;
  if (result.code !== 0) {
    throw new Error(`Feishu error: ${result.msg} (code ${result.code})`);
  }
}

function buildSignFields(secret?: string): Record<string, unknown> {
  if (!secret) return {};
  const timestamp = Math.floor(Date.now() / 1000);
  return { timestamp: String(timestamp), sign: genSign(secret, timestamp) };
}

export async function verifyWebhook(
  webhookUrl: string,
  secret?: string,
): Promise<{ ok: true }> {
  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Feishu webhook URL format');
  }

  await postWebhook(webhookUrl, {
    msg_type: 'text',
    content: { text: 'MedKit 连通性测试 ✓' },
    ...buildSignFields(secret),
  });

  return { ok: true };
}

export async function sendWebhook(
  webhookUrl: string,
  message: string,
  secret?: string,
): Promise<void> {
  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Feishu webhook URL format');
  }

  const lines = message.split('\n');
  const title = (lines[0] || '药品过期提醒').replace(/[*_~]/g, '');
  const body = lines.slice(1).join('\n').trim();

  const card = {
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'red',
    },
    elements: [
      {
        tag: 'markdown',
        content: body || message,
      },
    ],
  };

  await postWebhook(webhookUrl, {
    msg_type: 'interactive',
    card,
    ...buildSignFields(secret),
  });
}
