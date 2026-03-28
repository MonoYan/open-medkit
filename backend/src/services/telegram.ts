const BASE_URL = 'https://api.telegram.org/bot';

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

async function callApi<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data = (await response.json()) as { ok: boolean; result: T; description?: string };

  if (!data.ok) {
    throw new Error(data.description || `Telegram API error: ${method}`);
  }

  return data.result;
}

export async function getMe(token: string): Promise<{ id: number; username: string }> {
  const bot = await callApi<TelegramUser>(token, 'getMe');
  return { id: bot.id, username: bot.username || bot.first_name };
}

export async function getUpdates(
  token: string,
  offset?: number,
  timeout = 30,
): Promise<TelegramUpdate[]> {
  return callApi<TelegramUpdate[]>(token, 'getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message'],
  });
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML',
): Promise<void> {
  await callApi<TelegramMessage>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  });
}

/**
 * Poll getUpdates looking for a /start message. Returns the chat ID
 * of the first user who sends /start, or null if timeout elapses.
 */
export async function waitForStart(
  token: string,
  timeoutSeconds = 30,
): Promise<{ chatId: string; firstName?: string } | null> {
  const updates = await getUpdates(token, undefined, timeoutSeconds);

  for (const update of updates) {
    const msg = update.message;
    if (msg?.text?.startsWith('/start')) {
      // Acknowledge offset so this message isn't returned again
      await getUpdates(token, update.update_id + 1, 0);
      return {
        chatId: String(msg.chat.id),
        firstName: msg.from?.first_name,
      };
    }
  }

  // Acknowledge all processed updates even if none matched /start
  if (updates.length > 0) {
    const maxId = Math.max(...updates.map((u) => u.update_id));
    await getUpdates(token, maxId + 1, 0);
  }

  return null;
}
