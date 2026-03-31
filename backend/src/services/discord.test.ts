import { describe, expect, it } from 'vitest';

import { isValidWebhookUrl } from './discord';

describe('discord', () => {
  describe('isValidWebhookUrl', () => {
    it('accepts valid discord.com webhook URLs', () => {
      expect(isValidWebhookUrl('https://discord.com/api/webhooks/123456/abcdefg')).toBe(true);
    });

    it('accepts valid discordapp.com webhook URLs', () => {
      expect(isValidWebhookUrl('https://discordapp.com/api/webhooks/123456/abcdefg')).toBe(true);
    });

    it('rejects non-discord URLs', () => {
      expect(isValidWebhookUrl('https://example.com/api/webhooks/123/abc')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(isValidWebhookUrl('')).toBe(false);
    });

    it('rejects URLs without webhook path', () => {
      expect(isValidWebhookUrl('https://discord.com/api/channels/123')).toBe(false);
    });
  });
});
