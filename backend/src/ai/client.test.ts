import { describe, expect, it } from 'vitest';

import { buildChatCompletionsUrl, getContentText, getStreamChunkText } from './client';

describe('buildChatCompletionsUrl', () => {
  it('appends /v1/chat/completions to bare base URL', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('appends /chat/completions when URL ends with /v1', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('returns as-is when URL already ends with /chat/completions', () => {
    expect(
      buildChatCompletionsUrl('https://custom.api/v1/chat/completions'),
    ).toBe('https://custom.api/v1/chat/completions');
  });

  it('strips trailing slashes', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(buildChatCompletionsUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});

describe('getContentText', () => {
  it('extracts string content', () => {
    const payload = { choices: [{ message: { content: 'hello' } }] };
    expect(getContentText(payload)).toBe('hello');
  });

  it('joins array content items', () => {
    const payload = {
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
          },
        },
      ],
    };
    expect(getContentText(payload)).toBe('part1part2');
  });

  it('returns empty string for missing content', () => {
    expect(getContentText({})).toBe('');
    expect(getContentText({ choices: [] })).toBe('');
    expect(getContentText({ choices: [{ message: {} }] })).toBe('');
  });
});

describe('getStreamChunkText', () => {
  it('extracts delta content from SSE chunk JSON', () => {
    const payload = JSON.stringify({
      choices: [{ delta: { content: 'text' } }],
    });
    expect(getStreamChunkText(payload)).toBe('text');
  });

  it('handles array delta content', () => {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            content: [
              { type: 'text', text: 'a' },
              { type: 'text', text: 'b' },
            ],
          },
        },
      ],
    });
    expect(getStreamChunkText(payload)).toBe('ab');
  });

  it('returns empty for malformed JSON', () => {
    expect(getStreamChunkText('not json')).toBe('');
  });

  it('returns empty for missing delta', () => {
    const payload = JSON.stringify({ choices: [{ delta: {} }] });
    expect(getStreamChunkText(payload)).toBe('');
  });

  it('handles nested text objects in delta content array', () => {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            content: [{ text: { value: 'nested' } }],
          },
        },
      ],
    });
    expect(getStreamChunkText(payload)).toBe('nested');
  });
});
