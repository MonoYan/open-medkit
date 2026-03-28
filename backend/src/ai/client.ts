import type { Context } from 'hono';

import type { AiEnv } from '../middleware/apiKey';
import { isRecord, parseAiJsonResponse, tryParseJson } from './json-utils';
import type { ChatCompletionResponse, ChatMessage, StreamChunkResponse } from './types';

export function buildChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, '');

  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

export function getContentText(payload: ChatCompletionResponse) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
      .join('');
  }

  return '';
}

function getTextFragment(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return '';
  }

  if (typeof value.text === 'string') {
    return value.text;
  }

  if (isRecord(value.text) && typeof value.text.value === 'string') {
    return value.text.value;
  }

  if (typeof value.value === 'string') {
    return value.value;
  }

  return '';
}

export function getStreamChunkText(payload: string) {
  const chunk = tryParseJson<StreamChunkResponse>(payload);
  const content = chunk?.choices?.[0]?.delta?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(getTextFragment).join('');
  }

  return '';
}

export async function readAiErrorDetail(response: Response) {
  const fallback = `AI request failed with status ${response.status}`;

  try {
    const errText = await response.text();
    const errJson = tryParseJson<{ error?: { message?: string } }>(errText);

    if (errJson?.error?.message) {
      return errJson.error.message;
    }

    return errText.trim() || fallback;
  } catch {
    return fallback;
  }
}

function buildRequestBody(
  model: string,
  messages: ChatMessage[],
  options?: { jsonMode?: boolean; stream?: boolean },
) {
  const body: Record<string, unknown> = { model, messages };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (options?.stream) {
    body.stream = true;
  }

  return body;
}

function buildHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

const JSON_MODE_RETRY_STATUSES = [400, 404, 415, 422];
const JSON_MODE_RETRY_PATTERN =
  /(response_format|json_object|unsupported|not support|invalid parameter|extra inputs)/i;

function shouldRetryWithoutJsonMode(status: number, errorDetail: string) {
  return JSON_MODE_RETRY_STATUSES.includes(status) && JSON_MODE_RETRY_PATTERN.test(errorDetail);
}

/**
 * Fetch a streaming response from the AI provider. If `jsonMode` is true and
 * the provider rejects it, automatically retries without json_object.
 * Returns the raw Response for the caller to consume the stream.
 */
export async function fetchStream(
  c: Context<AiEnv>,
  messages: ChatMessage[],
  jsonMode = true,
): Promise<Response> {
  const aiApiKey = c.get('aiApiKey');
  const aiBaseUrl = c.get('aiBaseUrl');
  const aiModel = c.get('aiModel');
  const url = buildChatCompletionsUrl(aiBaseUrl);
  const headers = buildHeaders(aiApiKey);

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(aiModel, messages, { jsonMode, stream: true })),
  });

  if (!response.ok && jsonMode) {
    const errorDetail = await readAiErrorDetail(response);

    if (shouldRetryWithoutJsonMode(response.status, errorDetail)) {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildRequestBody(aiModel, messages, { stream: true })),
      });
    }
  }

  return response;
}

/**
 * Make a non-streaming AI call expecting JSON output. Retries without
 * json_object if the provider doesn't support it.
 */
export async function callAiJson<T>(
  c: Context<AiEnv>,
  messages: ChatMessage[],
) {
  const aiApiKey = c.get('aiApiKey');
  const aiBaseUrl = c.get('aiBaseUrl');
  const aiModel = c.get('aiModel');
  const url = buildChatCompletionsUrl(aiBaseUrl);
  const headers = buildHeaders(aiApiKey);

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(aiModel, messages, { jsonMode: true })),
  });

  if (!response.ok) {
    const errorDetail = await readAiErrorDetail(response);

    if (shouldRetryWithoutJsonMode(response.status, errorDetail)) {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildRequestBody(aiModel, messages)),
      });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ChatCompletionResponse;
      throw new Error(
        payload.error?.message || `AI request failed with status ${response.status}`,
      );
    }
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const raw = getContentText(payload);
  return { parsed: parseAiJsonResponse<T>(raw), raw };
}

/**
 * Make a non-streaming AI call returning raw text (no json_object mode).
 */
export async function callAiText(
  c: Context<AiEnv>,
  messages: ChatMessage[],
) {
  const aiApiKey = c.get('aiApiKey');
  const aiBaseUrl = c.get('aiBaseUrl');
  const aiModel = c.get('aiModel');

  const response = await fetch(buildChatCompletionsUrl(aiBaseUrl), {
    method: 'POST',
    headers: buildHeaders(aiApiKey),
    body: JSON.stringify(buildRequestBody(aiModel, messages)),
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `AI request failed with status ${response.status}`);
  }

  return getContentText(payload);
}
