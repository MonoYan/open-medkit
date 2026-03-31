import { describe, expect, it } from 'vitest';

import { isValidWebhookUrl } from './feishu';

describe('feishu', () => {
  describe('isValidWebhookUrl', () => {
    it('accepts valid feishu webhook URLs', () => {
      expect(
        isValidWebhookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc-def-123'),
      ).toBe(true);
    });

    it('rejects non-feishu URLs', () => {
      expect(isValidWebhookUrl('https://example.com/hook/abc')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(isValidWebhookUrl('')).toBe(false);
    });

    it('rejects URLs without the bot hook path', () => {
      expect(isValidWebhookUrl('https://open.feishu.cn/open-apis/auth/v3/token')).toBe(false);
    });
  });
});
