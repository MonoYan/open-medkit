import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';
import type { Settings } from '../types';
import { SettingsModal } from './SettingsModal';

const setTimezoneMock = vi.fn();
const detectTimezoneMock = vi.fn();

vi.mock('../lib/api', () => ({
  deleteNotificationChannel: vi.fn(),
  exportMedicines: vi.fn(),
  getNotificationChannels: vi.fn(),
  importMedicines: vi.fn(),
  linkTelegram: vi.fn(),
  saveDiscordWebhook: vi.fn(),
  saveFeishuWebhook: vi.fn(),
  testAiConnection: vi.fn(),
  testNotificationChannel: vi.fn(),
  updateNotificationChannel: vi.fn(),
  verifyDiscordWebhook: vi.fn(),
  verifyFeishuWebhook: vi.fn(),
  verifyTelegramBot: vi.fn(),
}));

vi.mock('../hooks/useTimezone', () => ({
  useTimezone: () => ({
    timezone: 'UTC',
    configured: false,
    loading: false,
    error: '',
    setTimezone: setTimezoneMock,
    detectTimezone: detectTimezoneMock,
    refreshTimezone: vi.fn(),
  }),
}));

const settings: Settings = {
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  defaultHomeTab: 'ai',
  defaultListView: 'grid',
  expiringDays: 30,
  aiResponseStyle: 'concise',
  themePreference: 'system',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('SettingsModal', () => {
  it('lets users search and keyboard-select a timezone before saving', async () => {
    vi.mocked(api.getNotificationChannels).mockResolvedValue([]);
    setTimezoneMock.mockResolvedValue({ timezone: 'America/New_York', configured: true });

    render(
      <SettingsModal
        open
        onClose={vi.fn()}
        settings={settings}
        resolvedTheme="light"
        updateSettings={vi.fn()}
        onImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '通用设置' }));
    fireEvent.click(screen.getByRole('button', { name: '修改时区' }));
    fireEvent.click(screen.getByRole('button', { name: '选择业务时区' }));

    const searchInput = screen.getByPlaceholderText('搜索时区，如 Asia/Shanghai');
    fireEvent.change(searchInput, { target: { value: 'new york' } });

    expect(screen.getByRole('option', { name: 'America/New_York' })).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0]);

    await waitFor(() => expect(setTimezoneMock).toHaveBeenCalledWith('America/New_York'));
    expect(screen.getByText('已切换为 America/New_York')).toBeInTheDocument();
  });

  it('updates telegram notification hour through the custom select', async () => {
    vi.mocked(api.getNotificationChannels).mockResolvedValue([
      {
        channel_type: 'telegram',
        enabled: true,
        notify_hour: 9,
        config: {
          botToken: 'bot-token',
          chatId: 'chat-id',
          botUsername: 'medkit_bot',
        },
      },
    ]);
    vi.mocked(api.updateNotificationChannel).mockResolvedValue({
      channel_type: 'telegram',
      enabled: true,
      notify_hour: 14,
      config: {
        botToken: 'bot-token',
        chatId: 'chat-id',
        botUsername: 'medkit_bot',
      },
    });

    render(
      <SettingsModal
        open
        onClose={vi.fn()}
        settings={settings}
        resolvedTheme="light"
        updateSettings={vi.fn()}
        onImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '通知提醒' }));

    await waitFor(() => expect(api.getNotificationChannels).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Telegram 每日发送时间' }));
    fireEvent.click(screen.getByRole('option', { name: '14:00' }));

    await waitFor(() =>
      expect(api.updateNotificationChannel).toHaveBeenCalledWith('telegram', {
        notify_hour: 14,
      }),
    );

    expect(screen.getByRole('button', { name: 'Telegram 每日发送时间' })).toHaveTextContent(
      '14:00',
    );
  });
});
