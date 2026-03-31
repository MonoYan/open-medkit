const WEBHOOK_URL_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/.+$/;

interface DiscordWebhookInfo {
  id: string;
  name: string;
  channel_id: string;
  guild_id: string;
}

export function isValidWebhookUrl(url: string): boolean {
  return WEBHOOK_URL_PATTERN.test(url);
}

export async function verifyWebhook(
  webhookUrl: string,
): Promise<{ name: string }> {
  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Discord webhook URL format');
  }

  const response = await fetch(webhookUrl, { method: 'GET' });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API error (${response.status}): ${text}`);
  }

  const info = (await response.json()) as DiscordWebhookInfo;
  return { name: info.name };
}

export async function sendWebhook(
  webhookUrl: string,
  message: string,
): Promise<void> {
  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Discord webhook URL format');
  }

  const lines = message.split('\n');
  const title = lines[0] || '药品过期提醒';
  const description = lines.slice(1).join('\n').trim();

  const payload = {
    embeds: [
      {
        title,
        description: description || undefined,
        color: 0xc84b2f,
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord webhook error (${response.status}): ${text}`);
  }
}
