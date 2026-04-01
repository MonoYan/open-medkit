import type {
  AppSettings,
  AiQueryStreamEvent,
  BatchParseResult,
  MedicineFilterStatus,
  Medicine,
  NotificationChannel,
  Settings,
  Stats,
} from '../types';

const API_BASE = '/api';

type MedicinePayload = Omit<Medicine, 'id' | 'created_at' | 'updated_at'>;

function buildAiHeaders(settings?: Settings) {
  const headers: HeadersInit = {};

  if (!settings) {
    return headers;
  }

  if (settings.aiApiKey.trim()) {
    headers['X-AI-Api-Key'] = settings.aiApiKey.trim();
  }

  if (settings.aiBaseUrl.trim()) {
    headers['X-AI-Base-Url'] = settings.aiBaseUrl.trim();
  }

  if (settings.aiModel.trim()) {
    headers['X-AI-Model'] = settings.aiModel.trim();
  }

  return headers;
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, init);
  const contentType = response.headers.get('Content-Type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.error ||
      (payload?.detail ? `${payload.error}: ${payload.detail}` : response.statusText);
    throw new Error(message || 'Request failed');
  }

  return payload as T;
}

export async function getMedicines(filters?: {
  category?: string;
  status?: MedicineFilterStatus;
  expiringDays?: number;
}) {
  const search = new URLSearchParams();

  if (filters?.category) {
    search.set('category', filters.category);
  }

  if (filters?.status) {
    search.set('status', filters.status);
  }

  if (typeof filters?.expiringDays === 'number') {
    search.set('expiringDays', String(filters.expiringDays));
  }

  const query = search.toString();
  const payload = await request<{ data: Medicine[] }>(`/medicines${query ? `?${query}` : ''}`);
  return payload.data;
}

export async function getStats(expiringDays?: number) {
  const search = new URLSearchParams();

  if (typeof expiringDays === 'number') {
    search.set('expiringDays', String(expiringDays));
  }

  const query = search.toString();
  const payload = await request<{ data: Stats }>(`/medicines/stats${query ? `?${query}` : ''}`);
  return payload.data;
}

export async function getCategories() {
  const payload = await request<{ data: string[] }>('/medicines/categories');
  return payload.data;
}

export async function getMedicine(id: number) {
  const payload = await request<{ data: Medicine }>(`/medicines/${id}`);
  return payload.data;
}

export async function createMedicine(data: MedicinePayload) {
  const payload = await request<{ data: Medicine }>('/medicines', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return payload.data;
}

export async function updateMedicine(id: number, data: Partial<Medicine>) {
  const payload = await request<{ data: Medicine }>(`/medicines/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return payload.data;
}

export async function deleteMedicine(id: number) {
  await request<{ data: { deleted: boolean } }>(`/medicines/${id}`, {
    method: 'DELETE',
  });
}

export async function exportMedicines() {
  const response = await fetch(`${API_BASE}/medicines/export`);

  if (!response.ok) {
    let message = response.statusText;

    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText;
    }

    throw new Error(message || 'Export failed');
  }

  return response.blob();
}

export async function importMedicines(file: File) {
  const text = await file.text();
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('导入文件不是有效的 JSON');
  }

  const payload = await request<{
    data: { imported: number; skipped: number; errors: string[] };
  }>('/medicines/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(json),
  });

  return payload.data;
}

export async function parseMedicine(text: string, settings: Settings) {
  const payload = await request<{ data: Partial<Medicine> }>('/ai/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({ text }),
  });

  return payload.data;
}

export async function completeMedicineDraft(
  draft: Partial<Medicine>,
  settings: Settings,
  sourceText?: string
) {
  const payload = await request<{
    data: Partial<Pick<Medicine, 'name' | 'name_en' | 'spec' | 'category' | 'usage_desc'>>;
  }>('/ai/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({
      draft,
      sourceText: sourceText?.trim() || '',
    }),
  });

  return payload.data;
}

export async function parseMedicineStream(
  text: string,
  settings: Settings,
  onChunk: (content: string) => void,
  signal?: AbortSignal,
): Promise<Partial<Medicine>> {
  const response = await fetch(`${API_BASE}/ai/parse-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      throw new Error(payload.error || payload.detail || 'Stream request failed');
    }
    throw new Error(`Stream request failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise<Partial<Medicine>>((resolve, reject) => {
    const read = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            reject(new Error('Stream ended without completion'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();

            try {
              const event = JSON.parse(payload) as {
                type: string;
                content?: string;
                medicine?: Partial<Medicine>;
                message?: string;
              };

              if (event.type === 'text' && event.content) {
                onChunk(event.content);
              } else if (event.type === 'done' && event.medicine) {
                resolve(event.medicine);
                return;
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'AI stream error'));
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        reject(err);
      }
    };

    void read();
  });
}

export async function parseMedicineImageStream(
  imageDataUrl: string,
  settings: Settings,
  onChunk: (content: string) => void,
  signal?: AbortSignal,
): Promise<Partial<Medicine>> {
  const response = await fetch(`${API_BASE}/ai/parse-image-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({ image: imageDataUrl }),
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      throw new Error(payload.error || payload.detail || 'Image parse request failed');
    }
    throw new Error(`Image parse request failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise<Partial<Medicine>>((resolve, reject) => {
    const read = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            reject(new Error('Stream ended without completion'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();

            try {
              const event = JSON.parse(payload) as {
                type: string;
                content?: string;
                medicine?: Partial<Medicine>;
                message?: string;
              };

              if (event.type === 'text' && event.content) {
                onChunk(event.content);
              } else if (event.type === 'done' && event.medicine) {
                resolve(event.medicine);
                return;
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'AI image parse error'));
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        reject(err);
      }
    };

    void read();
  });
}

export async function parseMedicineBatch(text: string, settings: Settings) {
  const payload = await request<{ data: BatchParseResult }>('/ai/parse-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({ text }),
  });

  return payload.data;
}

export async function parseMedicineBatchStream(
  text: string,
  settings: Settings,
  onChunk: (content: string) => void,
  signal?: AbortSignal,
): Promise<BatchParseResult> {
  const response = await fetch(`${API_BASE}/ai/parse-batch-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      throw new Error(payload.error || payload.detail || 'Batch stream request failed');
    }
    throw new Error(`Batch stream request failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise<BatchParseResult>((resolve, reject) => {
    const read = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            reject(new Error('Stream ended without completion'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();

            try {
              const event = JSON.parse(payload) as {
                type: string;
                content?: string;
                results?: BatchParseResult['results'];
                message?: string;
              };

              if (event.type === 'text' && event.content) {
                onChunk(event.content);
              } else if (event.type === 'done' && event.results) {
                resolve({ results: event.results });
                return;
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'AI batch stream error'));
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        reject(err);
      }
    };

    void read();
  });
}

export async function queryMedicines(
  question: string,
  settings: Settings,
  signal?: AbortSignal,
) {
  const payload = await request<{ data: { answer: string; medicines: Medicine[] } }>('/ai/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({
      question,
      responseStyle: settings.aiResponseStyle,
      expiringDays: settings.expiringDays,
    }),
    signal,
  });

  return payload.data;
}

export async function queryMedicinesStream(
  question: string,
  settings: Settings,
  onEvent: (event: AiQueryStreamEvent) => void,
  signal?: AbortSignal,
): Promise<{ answer: string; medicines: Medicine[] }> {
  const response = await fetch(`${API_BASE}/ai/query-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({
      question,
      responseStyle: settings.aiResponseStyle,
      expiringDays: settings.expiringDays,
    }),
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      throw new Error(payload.error || payload.detail || 'Stream request failed');
    }
    throw new Error(`Stream request failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise<{ answer: string; medicines: Medicine[] }>((resolve, reject) => {
    const read = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            reject(new Error('Stream ended without completion'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();

            try {
              const event = JSON.parse(payload) as AiQueryStreamEvent;

              if (event.type === 'text') {
                onEvent(event);
              } else if (event.type === 'done') {
                resolve({
                  answer: event.answer,
                  medicines: event.medicines,
                });
                return;
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'AI stream error'));
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        reject(err);
      }
    };

    void read();
  });
}

export async function testAiConnection(settings: Settings) {
  const payload = await request<{
    data: { ok: boolean; message: string; model: string; baseUrl: string };
  }>('/ai/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAiHeaders(settings),
    },
    body: JSON.stringify({}),
  });

  return payload.data;
}

export async function getAiConfigStatus() {
  const payload = await request<{
    data: {
      hasServerAiConfig: boolean;
      defaultBaseUrl: string;
      defaultModel: string;
    };
  }>('/ai/config-status');

  return payload.data;
}

export async function getAppSettings() {
  const payload = await request<{ data: AppSettings }>('/settings');
  return payload.data;
}

export async function setTimezone(timezone: string) {
  const payload = await request<{ data: AppSettings }>('/settings/timezone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// Notification channels
// ---------------------------------------------------------------------------

export async function getNotificationChannels() {
  const payload = await request<{ data: NotificationChannel[] }>('/notifications/channels');
  return payload.data;
}

export async function updateNotificationChannel(
  type: string,
  data: { enabled?: boolean; config?: Record<string, unknown>; notify_hour?: number },
) {
  const payload = await request<{ data: NotificationChannel }>(`/notifications/channels/${type}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return payload.data;
}

export async function deleteNotificationChannel(type: string) {
  await request<{ data: { deleted: boolean } }>(`/notifications/channels/${type}`, {
    method: 'DELETE',
  });
}

export async function verifyTelegramBot(botToken: string) {
  const payload = await request<{ data: { botUsername: string } }>(
    '/notifications/channels/telegram/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken }),
    },
  );
  return payload.data;
}

export async function linkTelegram(botToken: string, signal?: AbortSignal) {
  const payload = await request<{
    data: { linked: boolean; chatId?: string; botUsername?: string };
  }>('/notifications/channels/telegram/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken }),
    signal,
  });
  return payload.data;
}

export async function testNotificationChannel(type: string) {
  const payload = await request<{ data: { message: string } }>(
    `/notifications/channels/${type}/test`,
    { method: 'POST' },
  );
  return payload.data;
}

// Discord

export async function verifyDiscordWebhook(webhookUrl: string) {
  const payload = await request<{ data: { name: string } }>(
    '/notifications/channels/discord/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    },
  );
  return payload.data;
}

export async function saveDiscordWebhook(webhookUrl: string) {
  const payload = await request<{ data: { saved: boolean; name: string } }>(
    '/notifications/channels/discord/save',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    },
  );
  return payload.data;
}

// Feishu

export async function verifyFeishuWebhook(webhookUrl: string, secret?: string) {
  const payload = await request<{ data: { ok: boolean } }>(
    '/notifications/channels/feishu/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, ...(secret ? { secret } : {}) }),
    },
  );
  return payload.data;
}

export async function saveFeishuWebhook(webhookUrl: string, secret?: string) {
  const payload = await request<{ data: { saved: boolean } }>(
    '/notifications/channels/feishu/save',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, ...(secret ? { secret } : {}) }),
    },
  );
  return payload.data;
}
