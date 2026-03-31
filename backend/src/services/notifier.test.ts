import { describe, expect, it } from 'vitest';

import { buildNotificationMessage } from './notifier';

describe('buildNotificationMessage', () => {
  it('includes expired medicines', () => {
    const expired = [
      { id: 1, name: '布洛芬', expires_at: '2026-03-10' },
    ];
    const message = buildNotificationMessage(expired, [], '2026-03-29');
    expect(message).toContain('已过期');
    expect(message).toContain('布洛芬');
    expect(message).toContain('1 件');
  });

  it('includes expiring medicines', () => {
    const expiring = [
      { id: 2, name: '创可贴', expires_at: '2026-04-15' },
    ];
    const message = buildNotificationMessage([], expiring, '2026-03-29');
    expect(message).toContain('即将过期');
    expect(message).toContain('创可贴');
  });

  it('includes both expired and expiring', () => {
    const expired = [{ id: 1, name: '布洛芬', expires_at: '2026-03-10' }];
    const expiring = [{ id: 2, name: '创可贴', expires_at: '2026-04-15' }];
    const message = buildNotificationMessage(expired, expiring, '2026-03-29');
    expect(message).toContain('布洛芬');
    expect(message).toContain('创可贴');
    expect(message).toContain('已过期');
    expect(message).toContain('即将过期');
  });

  it('includes the header', () => {
    const message = buildNotificationMessage(
      [{ id: 1, name: 'A', expires_at: '2026-03-01' }],
      [],
      '2026-03-29',
    );
    expect(message).toContain('药品过期提醒');
  });

  it('calculates days correctly', () => {
    const expired = [{ id: 1, name: 'A', expires_at: '2026-03-19' }];
    const message = buildNotificationMessage(expired, [], '2026-03-29');
    expect(message).toContain('10 天');
  });

  it('defaults to html format with <b> tags', () => {
    const expired = [{ id: 1, name: 'A', expires_at: '2026-03-10' }];
    const message = buildNotificationMessage(expired, [], '2026-03-29');
    expect(message).toContain('<b>');
  });

  it('uses **bold** in markdown format', () => {
    const expired = [{ id: 1, name: 'A', expires_at: '2026-03-10' }];
    const message = buildNotificationMessage(expired, [], '2026-03-29', 'markdown');
    expect(message).toContain('**');
    expect(message).not.toContain('<b>');
  });

  it('uses no markup in plain format', () => {
    const expired = [{ id: 1, name: 'A', expires_at: '2026-03-10' }];
    const message = buildNotificationMessage(expired, [], '2026-03-29', 'plain');
    expect(message).not.toContain('<b>');
    expect(message).not.toContain('**');
    expect(message).toContain('药品过期提醒');
  });
});
