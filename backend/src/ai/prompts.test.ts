import { describe, expect, it } from 'vitest';

import {
  buildBatchParsePrompt,
  buildDraftCompletionPrompt,
  buildImageParseMessages,
  buildParsePrompt,
  buildQueryMessages,
  buildQueryPrompt,
} from './prompts';

const testCategories = ['感冒发烧', '外伤处理', '维生素补剂'];

describe('buildParsePrompt', () => {
  it('includes all categories', () => {
    const prompt = buildParsePrompt(testCategories);
    for (const cat of testCategories) {
      expect(prompt).toContain(cat);
    }
  });

  it('includes expected JSON field names', () => {
    const prompt = buildParsePrompt(testCategories);
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('"name_en"');
    expect(prompt).toContain('"expires_at"');
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('YYYY-MM-DD');
  });
});

describe('buildBatchParsePrompt', () => {
  it('includes item count', () => {
    const prompt = buildBatchParsePrompt(testCategories, 5);
    expect(prompt).toContain('5');
    expect(prompt).toContain('medicines');
  });

  it('includes categories', () => {
    const prompt = buildBatchParsePrompt(testCategories, 3);
    expect(prompt).toContain('感冒发烧');
  });
});

describe('buildDraftCompletionPrompt', () => {
  it('includes categories', () => {
    const prompt = buildDraftCompletionPrompt(testCategories);
    for (const cat of testCategories) {
      expect(prompt).toContain(cat);
    }
  });

  it('mentions expected fields', () => {
    const prompt = buildDraftCompletionPrompt(testCategories);
    expect(prompt).toContain('name');
    expect(prompt).toContain('name_en');
    expect(prompt).toContain('spec');
    expect(prompt).toContain('category');
    expect(prompt).toContain('usage_desc');
  });
});

describe('buildImageParseMessages', () => {
  it('returns system + user messages with image', () => {
    const messages = buildImageParseMessages(testCategories, 'data:image/jpeg;base64,abc');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(Array.isArray(messages[1].content)).toBe(true);
  });

  it('includes image_url in user message content', () => {
    const messages = buildImageParseMessages(testCategories, 'data:image/png;base64,xyz');
    const userContent = messages[1].content as Array<{ type: string }>;
    const imageItem = userContent.find((item) => item.type === 'image_url');
    expect(imageItem).toBeDefined();
  });
});

describe('buildQueryPrompt', () => {
  it('includes date boundaries', () => {
    const prompt = buildQueryPrompt('2026-03-29', '2026-04-28', 30, 'concise');
    expect(prompt).toContain('2026-03-29');
    expect(prompt).toContain('2026-04-28');
  });

  it('adapts instructions based on response style', () => {
    const concise = buildQueryPrompt('2026-03-29', '2026-04-28', 30, 'concise');
    const detailed = buildQueryPrompt('2026-03-29', '2026-04-28', 30, 'detailed');
    expect(concise).toContain('简洁');
    expect(detailed).toContain('详细');
  });

  it('includes MEDKIT_IDS marker instruction', () => {
    const prompt = buildQueryPrompt('2026-03-29', '2026-04-28', 30, 'concise');
    expect(prompt).toContain('MEDKIT_IDS');
  });
});

describe('buildQueryMessages', () => {
  it('returns system + user messages', () => {
    const medicines = [{ id: 1, name: '布洛芬' }];
    const messages = buildQueryMessages(
      '有没有退烧药',
      medicines as any,
      '2026-03-29',
      '2026-04-28',
      30,
      'concise',
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('includes medicine data and question in user message', () => {
    const medicines = [{ id: 1, name: '布洛芬' }];
    const messages = buildQueryMessages(
      '有退烧药吗',
      medicines as any,
      '2026-03-29',
      '2026-04-28',
      30,
      'concise',
    );
    expect(messages[1].content).toContain('布洛芬');
    expect(messages[1].content).toContain('有退烧药吗');
  });
});
