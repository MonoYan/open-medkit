import type { Context } from 'hono';

import type { AiEnv } from '../middleware/apiKey';
import { fetchStream, getStreamChunkText, readAiErrorDetail } from './client';
import type { ChatMessage } from './types';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

type SseEvent = Record<string, unknown>;

interface SseProxyOptions<TDone> {
  /** Hono context (carries AI credentials). */
  c: Context<AiEnv>;
  /** Chat messages to send upstream. */
  messages: ChatMessage[];
  /** Enable response_format json_object (with auto-retry). Default true. */
  jsonMode?: boolean;
  /**
   * Called after the upstream stream completes. Return a non-null value to
   * emit a `done` event; return null to trigger the fallback path.
   */
  resolve: (accumulated: string) => TDone | null;
  /** Wrap the resolved value into the SSE `done` event payload. */
  buildDoneEvent: (result: TDone) => SseEvent;
  /**
   * Invoked when `resolve` returns null. Should return a complete SSE event
   * (either a done or error event) to send to the client.
   */
  fallback?: () => Promise<SseEvent>;
}

/**
 * Generic SSE proxy for parse-style endpoints. Handles:
 * - Upstream streaming fetch with json_object retry
 * - SSE chunk forwarding to the client
 * - Accumulated text resolution after stream ends
 * - Fallback to non-streaming call if resolution fails
 *
 * NOT used for /query-stream which has its own pendingText holdback logic.
 */
export async function createSseProxyResponse<TDone>(
  options: SseProxyOptions<TDone>,
): Promise<Response> {
  const { c, messages, jsonMode = true, resolve, buildDoneEvent, fallback } = options;

  const upstreamResponse = await fetchStream(c, messages, jsonMode);

  if (!upstreamResponse.ok) {
    const detail = await readAiErrorDetail(upstreamResponse);
    return new Response(JSON.stringify({ error: 'AI service error', detail }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstreamResponse.body) {
    return new Response(JSON.stringify({ error: 'AI service error', detail: 'No response body' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      let accumulated = '';
      let buffer = '';
      const reader = (upstreamResponse.body as ReadableStream<Uint8Array>).getReader();

      const sendEvent = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
            if (payload === '[DONE]') continue;

            const content = getStreamChunkText(payload);
            if (content) {
              accumulated += content;
              sendEvent({ type: 'text', content });
            }
          }
        }

        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
            if (payload !== '[DONE]') {
              const content = getStreamChunkText(payload);
              if (content) {
                accumulated += content;
                sendEvent({ type: 'text', content });
              }
            }
          }
        }

        const result = resolve(accumulated);

        if (result !== null) {
          sendEvent(buildDoneEvent(result));
          return;
        }

        if (fallback) {
          sendEvent(await fallback());
          return;
        }

        sendEvent({ type: 'error', message: 'AI returned invalid format' });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : 'Stream error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, { headers: SSE_HEADERS });
}
