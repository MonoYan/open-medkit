import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignJustify,
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  Info,
  LayoutGrid,
  MessageSquareText,
  Monitor,
  Moon,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';

import {
  deleteNotificationChannel,
  exportMedicines,
  getNotificationChannels,
  importMedicines,
  linkTelegram,
  saveDiscordWebhook,
  saveFeishuWebhook,
  testAiConnection,
  testNotificationChannel,
  updateNotificationChannel,
  verifyDiscordWebhook,
  verifyFeishuWebhook,
  verifyTelegramBot,
} from '../lib/api';
import { useTimezone } from '../hooks/useTimezone';
import type {
  DiscordChannelConfig,
  FeishuChannelConfig,
  NotificationChannel,
  Settings,
  TelegramChannelConfig,
} from '../types';
import { DismissibleNotice } from './DismissibleNotice';
import { ComboboxSelect } from './ComboboxSelect';
import { SelectMenu } from './SelectMenu';

const homeTabOptions = [
  { value: 'ai', label: 'AI 检索', description: '打开应用后直接进入对话问答。' },
  { value: 'manual', label: '药品列表', description: '打开应用后先看库存和筛选列表。' },
] as const;

const listViewOptions = [
  { value: 'grid', label: '卡片视图', description: '适合快速浏览药品关键信息。' },
  { value: 'list', label: '表格视图', description: '一屏看到更多字段和明细条目。' },
] as const;

const themeIconMap = { system: Smartphone, light: Sun, dark: Moon } as const;
const listViewIconMap = { grid: LayoutGrid, list: AlignJustify } as const;

const aiStyleOptions = [
  { value: 'concise', label: '简洁', description: '优先给结论，回答更短更直接。' },
  { value: 'detailed', label: '详细', description: '补充更多判断依据和注意事项。' },
] as const;

const themeOptions = [
  { value: 'system', label: '跟随系统', description: '自动跟随设备的浅色或暗色外观。' },
  { value: 'light', label: '浅色', description: '保留明亮、纸面感更强的界面。' },
  { value: 'dark', label: '暗色', description: '在夜间浏览时更柔和、更沉稳。' },
] as const;

const reminderDayOptions = [7, 15, 30, 60] as const;
const notifyHourOptions = Array.from({ length: 24 }, (_, i) => i);
type SettingsTab = 'ai' | 'general' | 'notifications' | 'about' | 'privacy' | 'disclaimer';
type NotifyChannel = 'telegram' | 'discord' | 'feishu';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Seoul',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
] as const;

function getAllTimezoneOptions() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof intlWithSupportedValues.supportedValuesOf !== 'function') {
    return [...COMMON_TIMEZONES];
  }

  const supported = intlWithSupportedValues.supportedValuesOf('timeZone');
  return Array.from(new Set(['UTC', ...supported])).sort((left, right) => left.localeCompare(right));
}

const allTimezoneOptions = getAllTimezoneOptions();
const notifyHourSelectOptions = notifyHourOptions.map((hour) => ({
  value: hour,
  label: `${String(hour).padStart(2, '0')}:00`,
}));
const featuredTimezoneOptions = COMMON_TIMEZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
}));

const tabDescriptions: Record<SettingsTab, string> = {
  ai: '配置 AI 服务地址、模型和回答风格。留空时优先使用服务端 .env 中的默认值。',
  general: '调整界面主题、默认进入页面、列表样式和数据管理选项。',
  notifications: '管理 Telegram、Discord、飞书等提醒渠道与每日过期通知的发送时间。',
  about: '产品简介、功能亮点与技术栈。',
  privacy: '药箱数据的存储方式与 AI / 通知功能的外发说明。',
  disclaimer: '使用限制、AI 输出局限性与用药安全提醒。',
};

const settingsTabs = [
  { id: 'ai' as SettingsTab, label: 'AI 配置', icon: Cpu },
  { id: 'general' as SettingsTab, label: '通用设置', icon: SlidersHorizontal },
  { id: 'notifications' as SettingsTab, label: '通知提醒', icon: Bell },
  { id: 'about' as SettingsTab, label: '关于系统', icon: Info },
  { id: 'privacy' as SettingsTab, label: '数据隐私', icon: Shield },
  { id: 'disclaimer' as SettingsTab, label: '免责声明', icon: AlertTriangle },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  resolvedTheme: 'light' | 'dark';
  updateSettings: (partial: Partial<Settings>) => void;
  onImported: () => Promise<void>;
  aiSetupPrompt?: {
    defaultBaseUrl: string;
    defaultModel: string;
  } | null;
}

export function SettingsModal({
  open,
  onClose,
  settings,
  resolvedTheme,
  updateSettings,
  onImported,
  aiSetupPrompt = null,
}: SettingsModalProps) {
  const {
    timezone,
    configured: timezoneConfigured,
    loading: timezoneLoading,
    error: timezoneLoadError,
    setTimezone,
    detectTimezone,
  } = useTimezone();
  const secondaryButtonClass =
    'theme-button-neutral rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40';
  const primaryButtonClass =
    'rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40';
  const neutralFilledButtonClass =
    'rounded-lg border border-border/60 bg-header px-3 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-header-2 disabled:cursor-not-allowed disabled:opacity-40';
  const optionCardClass =
    'rounded-[10px] border px-3 py-2.5 text-left transition-all duration-200';
  const sectionClass = 'theme-panel-soft rounded-[12px] border p-3 sm:p-3.5';
  const sectionTitleClass = 'mb-2.5 text-[13px] font-semibold text-ink';
  const fieldLabelClass = 'mb-1 text-[12px] text-ink2';
  const inputClass =
    'theme-input w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none transition';
  const [form, setForm] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [mobileView, setMobileView] = useState<'nav' | 'content'>('nav');
  const [activeNotifyChannel, setActiveNotifyChannel] = useState<NotifyChannel>('telegram');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [timezoneInput, setTimezoneInput] = useState(timezone);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneStatus, setTimezoneStatus] = useState('');
  const [timezoneError, setTimezoneError] = useState('');
  const [timezoneEditing, setTimezoneEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timezoneSelectOptions = allTimezoneOptions.includes(timezoneInput)
    ? allTimezoneOptions
    : [timezoneInput, ...allTimezoneOptions];
  const timezoneSelectItems = timezoneSelectOptions.map((option) => ({
    value: option,
    label: option,
    searchText: option.replace(/[/_]/g, ' '),
  }));

  // Telegram notification state
  const [tgChannel, setTgChannel] = useState<NotificationChannel | null>(null);
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgVerifying, setTgVerifying] = useState(false);
  const [tgBotUsername, setTgBotUsername] = useState('');
  const [tgLinking, setTgLinking] = useState(false);
  const [tgTestingSend, setTgTestingSend] = useState(false);
  const [tgNotifyHour, setTgNotifyHour] = useState(9);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgStatus, setTgStatus] = useState('');
  const [tgError, setTgError] = useState('');
  const linkAbortRef = useRef<AbortController | null>(null);

  // Discord notification state
  const [dcChannel, setDcChannel] = useState<NotificationChannel | null>(null);
  const [dcWebhookUrl, setDcWebhookUrl] = useState('');
  const [dcVerifying, setDcVerifying] = useState(false);
  const [dcSaving, setDcSaving] = useState(false);
  const [dcTestingSend, setDcTestingSend] = useState(false);
  const [dcNotifyHour, setDcNotifyHour] = useState(9);
  const [dcEnabled, setDcEnabled] = useState(false);
  const [dcName, setDcName] = useState('');
  const [dcStatus, setDcStatus] = useState('');
  const [dcError, setDcError] = useState('');

  // Feishu notification state
  const [fsChannel, setFsChannel] = useState<NotificationChannel | null>(null);
  const [fsWebhookUrl, setFsWebhookUrl] = useState('');
  const [fsSecret, setFsSecret] = useState('');
  const [fsVerifying, setFsVerifying] = useState(false);
  const [fsSaving, setFsSaving] = useState(false);
  const [fsTestingSend, setFsTestingSend] = useState(false);
  const [fsNotifyHour, setFsNotifyHour] = useState(9);
  const [fsEnabled, setFsEnabled] = useState(false);
  const [fsStatus, setFsStatus] = useState('');
  const [fsError, setFsError] = useState('');

  const loadChannels = useCallback(async () => {
    try {
      const channels = await getNotificationChannels();

      const tg = channels.find((ch) => ch.channel_type === 'telegram') || null;
      setTgChannel(tg);
      if (tg) {
        const cfg = tg.config as TelegramChannelConfig;
        setTgBotUsername(cfg.botUsername || '');
        setTgNotifyHour(tg.notify_hour);
        setTgEnabled(tg.enabled);
      } else {
        setTgBotUsername('');
        setTgNotifyHour(9);
        setTgEnabled(false);
      }

      const dc = channels.find((ch) => ch.channel_type === 'discord') || null;
      setDcChannel(dc);
      if (dc) {
        const cfg = dc.config as DiscordChannelConfig;
        setDcName(cfg.name || '');
        setDcNotifyHour(dc.notify_hour);
        setDcEnabled(dc.enabled);
      } else {
        setDcName('');
        setDcNotifyHour(9);
        setDcEnabled(false);
      }

      const fs = channels.find((ch) => ch.channel_type === 'feishu') || null;
      setFsChannel(fs);
      if (fs) {
        setFsNotifyHour(fs.notify_hour);
        setFsEnabled(fs.enabled);
      } else {
        setFsNotifyHour(9);
        setFsEnabled(false);
      }
    } catch {
      // silently ignore on initial load
    }
  }, []);

  useEffect(() => {
    if (open) {
      setForm(settings);
      setStatus('');
      setError('');
      setTestStatus('');
      setTgStatus('');
      setTgError('');
      setTgBotToken('');
      setTgVerifying(false);
      setTgLinking(false);
      setTgTestingSend(false);
      setDcStatus('');
      setDcError('');
      setDcWebhookUrl('');
      setDcVerifying(false);
      setDcSaving(false);
      setDcTestingSend(false);
      setFsStatus('');
      setFsError('');
      setFsWebhookUrl('');
      setFsSecret('');
      setFsVerifying(false);
      setFsSaving(false);
      setFsTestingSend(false);
      setTimezoneInput(timezone);
      setTimezoneStatus('');
      setTimezoneError('');
      setTimezoneEditing(false);
      void loadChannels();
    }
    return () => {
      linkAbortRef.current?.abort();
    };
  }, [open, settings, loadChannels, timezone]);

  useEffect(() => {
    if (open) {
      setActiveTab('ai');
      setMobileView(aiSetupPrompt ? 'content' : 'nav');
    }
  }, [open, aiSetupPrompt]);

  if (!open) {
    return null;
  }

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setStatus('');

    try {
      const blob = await exportMedicines();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `medkit-export-${today}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('导出成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTimezoneSave = async (nextTimezone: string) => {
    const trimmedTimezone = nextTimezone.trim();

    if (!trimmedTimezone) {
      setTimezoneError('请输入有效的 IANA 时区，例如 Asia/Shanghai');
      setTimezoneStatus('');
      return;
    }

    setTimezoneSaving(true);
    setTimezoneError('');
    setTimezoneStatus('');

    try {
      const result = await setTimezone(trimmedTimezone);
      setTimezoneInput(result.timezone);
      setTimezoneStatus(`已切换为 ${result.timezone}`);
    } catch (err) {
      setTimezoneError(err instanceof Error ? err.message : '更新时区失败');
    } finally {
      setTimezoneSaving(false);
    }
  };

  const handleTimezoneAutoDetect = async () => {
    setTimezoneSaving(true);
    setTimezoneError('');
    setTimezoneStatus('');

    try {
      const result = await detectTimezone();
      setTimezoneInput(result.timezone);
      setTimezoneStatus(`已自动检测并保存为 ${result.timezone}`);
    } catch (err) {
      setTimezoneError(err instanceof Error ? err.message : '自动检测失败');
    } finally {
      setTimezoneSaving(false);
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) {
      return;
    }

    setLoading(true);
    setError('');
    setStatus('');

    try {
      const result = await importMedicines(file);
      await onImported();
      setStatus(`成功导入 ${result.imported} 条，跳过 ${result.skipped} 条`);
      if (result.errors.length > 0) {
        setError(result.errors.join('；'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setTestStatus('');

    try {
      const result = await testAiConnection(form);
      setTestStatus(`连接成功：${result.message}（模型：${result.model}）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleTgVerify = async () => {
    if (!tgBotToken.trim()) {
      setTgError('请输入 Bot Token');
      return;
    }
    setTgVerifying(true);
    setTgError('');
    setTgStatus('');
    try {
      const result = await verifyTelegramBot(tgBotToken.trim());
      setTgBotUsername(result.botUsername);
      setTgStatus(`Token 有效，Bot: @${result.botUsername}`);
    } catch (err) {
      setTgError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setTgVerifying(false);
    }
  };

  const handleTgLink = async () => {
    if (!tgBotToken.trim()) {
      setTgError('请输入 Bot Token');
      return;
    }
    setTgLinking(true);
    setTgError('');
    setTgStatus('等待你在 Telegram 中发送 /start …');
    const controller = new AbortController();
    linkAbortRef.current = controller;
    try {
      const result = await linkTelegram(tgBotToken.trim(), controller.signal);
      if (result.linked) {
        setTgStatus(`绑定成功！Chat ID: ${result.chatId}`);
        await loadChannels();
      } else {
        setTgStatus('');
        setTgError('30 秒内未收到 /start 消息，请重试。');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setTgError(err instanceof Error ? err.message : '绑定失败');
      setTgStatus('');
    } finally {
      setTgLinking(false);
      linkAbortRef.current = null;
    }
  };

  const handleTgUnlink = async () => {
    setTgError('');
    setTgStatus('');
    try {
      await deleteNotificationChannel('telegram');
      setTgChannel(null);
      setTgBotUsername('');
      setTgEnabled(false);
      setTgStatus('已解除绑定');
    } catch (err) {
      setTgError(err instanceof Error ? err.message : '解绑失败');
    }
  };

  const handleTgToggle = async (enabled: boolean) => {
    setTgError('');
    try {
      await updateNotificationChannel('telegram', { enabled });
      setTgEnabled(enabled);
    } catch (err) {
      setTgError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleTgHourChange = async (hour: number) => {
    setTgError('');
    setTgNotifyHour(hour);
    try {
      await updateNotificationChannel('telegram', { notify_hour: hour });
    } catch (err) {
      setTgError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleTgTest = async () => {
    setTgTestingSend(true);
    setTgError('');
    setTgStatus('');
    try {
      const result = await testNotificationChannel('telegram');
      setTgStatus(result.message);
    } catch (err) {
      setTgError(err instanceof Error ? err.message : '发送测试失败');
    } finally {
      setTgTestingSend(false);
    }
  };

  // -- Discord handlers --

  const handleDcVerify = async () => {
    if (!dcWebhookUrl.trim()) {
      setDcError('请输入 Webhook URL');
      return;
    }
    setDcVerifying(true);
    setDcError('');
    setDcStatus('');
    try {
      const result = await verifyDiscordWebhook(dcWebhookUrl.trim());
      setDcName(result.name);
      setDcStatus(`Webhook 有效：${result.name}`);
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setDcVerifying(false);
    }
  };

  const handleDcSave = async () => {
    if (!dcWebhookUrl.trim()) {
      setDcError('请输入 Webhook URL');
      return;
    }
    setDcSaving(true);
    setDcError('');
    setDcStatus('');
    try {
      const result = await saveDiscordWebhook(dcWebhookUrl.trim());
      setDcStatus(`已保存并启用：${result.name}`);
      setDcName(result.name);
      await loadChannels();
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setDcSaving(false);
    }
  };

  const handleDcUnlink = async () => {
    setDcError('');
    setDcStatus('');
    try {
      await deleteNotificationChannel('discord');
      setDcChannel(null);
      setDcName('');
      setDcEnabled(false);
      setDcStatus('已解除绑定');
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '解绑失败');
    }
  };

  const handleDcToggle = async (enabled: boolean) => {
    setDcError('');
    try {
      await updateNotificationChannel('discord', { enabled });
      setDcEnabled(enabled);
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDcHourChange = async (hour: number) => {
    setDcError('');
    setDcNotifyHour(hour);
    try {
      await updateNotificationChannel('discord', { notify_hour: hour });
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDcTest = async () => {
    setDcTestingSend(true);
    setDcError('');
    setDcStatus('');
    try {
      const result = await testNotificationChannel('discord');
      setDcStatus(result.message);
    } catch (err) {
      setDcError(err instanceof Error ? err.message : '发送测试失败');
    } finally {
      setDcTestingSend(false);
    }
  };

  // -- Feishu handlers --

  const handleFsVerify = async () => {
    if (!fsWebhookUrl.trim()) {
      setFsError('请输入 Webhook URL');
      return;
    }
    setFsVerifying(true);
    setFsError('');
    setFsStatus('');
    try {
      await verifyFeishuWebhook(fsWebhookUrl.trim(), fsSecret.trim() || undefined);
      setFsStatus('Webhook 验证成功（已发送测试消息）');
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setFsVerifying(false);
    }
  };

  const handleFsSave = async () => {
    if (!fsWebhookUrl.trim()) {
      setFsError('请输入 Webhook URL');
      return;
    }
    setFsSaving(true);
    setFsError('');
    setFsStatus('');
    try {
      await saveFeishuWebhook(fsWebhookUrl.trim(), fsSecret.trim() || undefined);
      setFsStatus('已保存并启用');
      await loadChannels();
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setFsSaving(false);
    }
  };

  const handleFsUnlink = async () => {
    setFsError('');
    setFsStatus('');
    try {
      await deleteNotificationChannel('feishu');
      setFsChannel(null);
      setFsEnabled(false);
      setFsStatus('已解除绑定');
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '解绑失败');
    }
  };

  const handleFsToggle = async (enabled: boolean) => {
    setFsError('');
    try {
      await updateNotificationChannel('feishu', { enabled });
      setFsEnabled(enabled);
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleFsHourChange = async (hour: number) => {
    setFsError('');
    setFsNotifyHour(hour);
    try {
      await updateNotificationChannel('feishu', { notify_hour: hour });
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleFsTest = async () => {
    setFsTestingSend(true);
    setFsError('');
    setFsStatus('');
    try {
      const result = await testNotificationChannel('feishu');
      setFsStatus(result.message);
    } catch (err) {
      setFsError(err instanceof Error ? err.message : '发送测试失败');
    } finally {
      setFsTestingSend(false);
    }
  };

  const getOptionCardStateClass = (selected: boolean) =>
    selected
      ? 'border-accent/30 bg-accent/10 shadow-[0_10px_30px_rgba(200,75,47,0.08)]'
      : 'border-border/60 bg-surface hover:border-border-strong/80 hover:bg-surface3';
  const activeTabLabel = settingsTabs.find((t) => t.id === activeTab)?.label ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 md:items-center md:p-3">
      <div className="absolute inset-0" aria-hidden="true" />
      <div className="theme-modal-shell relative z-10 flex h-[calc(100dvh-2rem)] w-full max-w-[860px] flex-col overflow-hidden rounded-t-[20px] border md:h-auto md:max-h-[calc(100vh-1.5rem)] md:flex-row md:rounded-[18px]">
        {/* Sidebar navigation */}
        <aside
          className={`shrink-0 p-4 md:flex md:w-[200px] md:flex-col md:border-r md:border-border/40 md:px-3 md:py-5 ${
            mobileView === 'nav' ? 'flex flex-col' : 'hidden'
          } md:!flex`}
        >
          <div className="flex items-start justify-between md:mb-1 md:block md:px-2.5">
            <div className="mb-4 md:mb-0">
              <h2 className="text-[18px] font-semibold text-ink md:text-[15px]">设置</h2>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-ink3">
                Preferences
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭设置"
              className="theme-icon-button rounded-full border p-1.5 transition-all duration-200 md:hidden"
            >
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {settingsTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileView('content');
                    setStatus('');
                    setError('');
                    setTestStatus('');
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-ink2 hover:bg-surface2 hover:text-ink'
                  }`}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 text-left">{tab.label}</span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink3/40 md:hidden"
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content area */}
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            mobileView === 'content' ? '' : 'hidden'
          } md:!flex`}
        >
          {/* Content header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMobileView('nav')}
                className="inline-flex shrink-0 items-center text-ink2 transition-colors hover:text-ink md:hidden"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              </button>
              <div className="min-w-0">
                <h3 className="truncate text-[16px] font-semibold leading-tight text-ink">
                  {activeTabLabel}
                </h3>
                <p className="mt-0.5 hidden truncate text-[11px] leading-[1.4] text-ink3 md:block">
                  {tabDescriptions[activeTab]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭设置"
              className="theme-icon-button shrink-0 rounded-full border p-1.5 transition-all duration-200"
            >
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5 md:p-4">
            {activeTab === 'about' ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src="/medkit-icon-rounded.png"
                      alt="Open MedKit"
                      className="h-10 w-10 shrink-0 rounded-[12px]"
                    />
                    <div>
                      <h3 className="text-[18px] font-semibold leading-tight text-ink sm:text-[20px]">
                        Open MedKit
                      </h3>
                      <p className="mt-0.5 font-mono text-[10px] tracking-wide text-ink3">
                        MIT License · Open Source 
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://github.com/MonoYan/open-medkit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="theme-button-neutral flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all"
                  >
                    GitHub
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <p className="text-[13px] leading-[1.7] text-ink2">
                  用自然语言录入和检索家中常备药，AI 自动提取结构化信息并追踪有效期，让你不再忘药、过期、找不到。
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { icon: MessageSquareText, title: '说一句话就入库', desc: 'AI 提取名称、规格、有效期，确认即入库' },
                    { icon: Search, title: '问一句话就找药', desc: '像聊天一样检索你的药箱' },
                    { icon: Bell, title: '过期自动提醒', desc: '到期药品高亮标记，支持 Telegram / Discord / 飞书推送' },
                    {
                      icon: Server,
                      title: 'MCP Server',
                      desc: '内置 MCP Server，通过 Claude Code, OpenClaw 等直接管理药箱',
                    },
                  ].map((f) => (
                    <div
                      key={f.title}
                      className="flex items-start gap-2.5 rounded-[10px] border border-border/40 bg-surface3 p-2.5"
                    >
                      <f.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink3" strokeWidth={1.8} />
                      <div>
                        <div className="text-[12px] font-medium leading-snug text-ink">{f.title}</div>
                        <div className="mt-0.5 text-[11px] leading-[1.4] text-ink3">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['React', 'Vite', 'TypeScript', 'Hono', 'SQLite', 'TailwindCSS', 'Docker', 'MCP'].map(
                    (tech) => (
                      <span
                        key={tech}
                        className="rounded-full border border-border/50 bg-surface4 px-2 py-0.5 font-mono text-[10px] text-ink3"
                      >
                        {tech}
                      </span>
                    ),
                  )}
                </div>

                  <div className="mt-4 border-t border-border/30 pt-3 text-[12px] text-ink3 text-center">
                    Made by{' '}
                    <a
                      href="https://x.com/sensh85"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-ink2 transition-colors hover:text-accent"
                    >
                      @sensh85
                    </a>
                  </div>
                </div>
                  

            ) : activeTab === 'notifications' ? (
              <>
                {/* Channel sub-tabs */}
                <div className="inline-flex w-fit rounded-[10px] border border-border/50 bg-surface4 p-[3px]">
                  {([
                    { key: 'telegram' as NotifyChannel, label: 'Telegram', connected: !!(tgChannel && (tgChannel.config as TelegramChannelConfig).chatId) },
                    { key: 'discord' as NotifyChannel, label: 'Discord', connected: !!(dcChannel && (dcChannel.config as DiscordChannelConfig).webhookUrl) },
                    { key: 'feishu' as NotifyChannel, label: '飞书', connected: !!(fsChannel && (fsChannel.config as FeishuChannelConfig).webhookUrl) },
                  ]).map((ch) => {
                    const isActive = activeNotifyChannel === ch.key;
                    return (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => setActiveNotifyChannel(ch.key)}
                        className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                          isActive
                            ? 'theme-panel border border-border/60 text-ink shadow-sm'
                            : 'border border-transparent text-ink3 hover:text-ink2'
                        }`}
                      >
                        <span
                          className={`inline-block h-[5px] w-[5px] shrink-0 rounded-full transition-colors ${
                            ch.connected ? 'bg-status-ok' : isActive ? 'bg-ink3/40' : 'bg-ink3/25'
                          }`}
                        />
                        {ch.label}
                      </button>
                    );
                  })}
                </div>

                {/* Telegram panel */}
                {activeNotifyChannel === 'telegram' && (
                  <section className={sectionClass}>
                    <div className="space-y-3">
                      <DismissibleNotice
                        noticeId="settings-telegram-privacy"
                        title="Telegram 外发提示"
                        className="bg-status-warn-bg/40 px-3 py-2.5 leading-[1.6]"
                      >
                        <p>
                          启用 Telegram 后，提醒消息会包含药品名称、到期日期和状态，并发送到 Telegram
                          Bot API 以及你绑定的聊天会话。请仅绑定你信任的账号或群组。
                        </p>
                      </DismissibleNotice>

                      {tgChannel && (tgChannel.config as TelegramChannelConfig).chatId ? (
                        <>
                          <div className="flex items-center gap-2 rounded-lg border border-status-ok/20 bg-status-ok-bg px-3 py-2">
                            <div className="h-2 w-2 rounded-full bg-status-ok" />
                            <span className="text-[12px] text-ink">
                              已绑定 @{tgBotUsername || '(unknown)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={tgEnabled}
                                onChange={(e) => void handleTgToggle(e.target.checked)}
                                className="h-4 w-4 rounded border-border accent-accent"
                              />
                              <span className="text-[12px] text-ink">启用每日提醒</span>
                            </label>
                          </div>

                          {tgEnabled && (
                            <div>
                              <div className={fieldLabelClass}>每日发送时间</div>
                              <SelectMenu
                                value={tgNotifyHour}
                                options={notifyHourSelectOptions}
                                onChange={(hour) => void handleTgHourChange(hour)}
                                ariaLabel="Telegram 每日发送时间"
                                className="max-w-[160px]"
                                buttonClassName={inputClass}
                              />
                              <p className="mt-1.5 text-[11px] leading-4 text-ink2">
                                每天按药箱时区 {timezone} 的此时间检查并发送提醒。
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleTgTest()}
                              disabled={tgTestingSend || !tgEnabled}
                              className={secondaryButtonClass}
                            >
                              {tgTestingSend ? '发送中...' : '发送测试通知'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTgUnlink()}
                              className={`${secondaryButtonClass} text-status-danger`}
                            >
                              解除绑定
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-[12px] leading-[1.5] text-ink2">
                            通过 Telegram Bot 接收过期提醒。请先在 Telegram 中找
                            <a
                              href="https://t.me/BotFather"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mx-0.5 text-accent hover:underline"
                            >
                              @BotFather
                            </a>
                            创建一个 Bot，获取 Token 后填入下方。
                          </p>

                          <label className="block">
                            <div className={fieldLabelClass}>Bot Token</div>
                            <input
                              type="password"
                              value={tgBotToken}
                              onChange={(e) => setTgBotToken(e.target.value)}
                              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                              className={inputClass}
                            />
                          </label>

                          {tgBotUsername ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 rounded-lg border border-status-ok/20 bg-status-ok-bg px-3 py-2">
                                <div className="h-2 w-2 rounded-full bg-status-ok" />
                                <span className="text-[12px] text-ink">Token 有效：@{tgBotUsername}</span>
                              </div>
                              <p className="text-[12px] text-ink2">
                                请打开{' '}
                                <a
                                  href={`https://t.me/${tgBotUsername}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline"
                                >
                                  t.me/{tgBotUsername}
                                </a>{' '}
                                并发送 <code className="rounded bg-surface4 px-1 py-0.5 text-[11px]">/start</code>，然后点击下方绑定。
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleTgLink()}
                                disabled={tgLinking}
                                className={primaryButtonClass}
                              >
                                {tgLinking ? '等待 /start 中...' : '开始绑定'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleTgVerify()}
                              disabled={tgVerifying || !tgBotToken.trim()}
                              className={secondaryButtonClass}
                            >
                              {tgVerifying ? '验证中...' : '验证 Token'}
                            </button>
                          )}
                        </>
                      )}

                      {tgStatus && (
                        <div className="text-[12px] text-status-ok">{tgStatus}</div>
                      )}
                      {tgError && (
                        <div className="text-[12px] text-status-danger">{tgError}</div>
                      )}
                    </div>
                  </section>
                )}

                {/* Discord panel */}
                {activeNotifyChannel === 'discord' && (
                  <section className={sectionClass}>
                    <div className="space-y-3">
                      {dcChannel && (dcChannel.config as DiscordChannelConfig).webhookUrl ? (
                        <>
                          <div className="flex items-center gap-2 rounded-lg border border-status-ok/20 bg-status-ok-bg px-3 py-2">
                            <div className="h-2 w-2 rounded-full bg-status-ok" />
                            <span className="text-[12px] text-ink">
                              已绑定 {dcName || 'Discord Webhook'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={dcEnabled}
                                onChange={(e) => void handleDcToggle(e.target.checked)}
                                className="h-4 w-4 rounded border-border accent-accent"
                              />
                              <span className="text-[12px] text-ink">启用每日提醒</span>
                            </label>
                          </div>

                          {dcEnabled && (
                            <div>
                              <div className={fieldLabelClass}>每日发送时间</div>
                              <SelectMenu
                                value={dcNotifyHour}
                                options={notifyHourSelectOptions}
                                onChange={(hour) => void handleDcHourChange(hour)}
                                ariaLabel="Discord 每日发送时间"
                                className="max-w-[160px]"
                                buttonClassName={inputClass}
                              />
                              <p className="mt-1.5 text-[11px] leading-4 text-ink2">
                                每天按药箱时区 {timezone} 的此时间检查并发送提醒。
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleDcTest()}
                              disabled={dcTestingSend || !dcEnabled}
                              className={secondaryButtonClass}
                            >
                              {dcTestingSend ? '发送中...' : '发送测试通知'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDcUnlink()}
                              className={`${secondaryButtonClass} text-status-danger`}
                            >
                              解除绑定
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-[12px] leading-[1.5] text-ink2">
                            通过 Discord Webhook 接收过期提醒。在 Discord 频道设置 &gt; 整合 &gt; Webhooks 中创建一个 Webhook，复制 URL 后填入下方。
                          </p>

                          <label className="block">
                            <div className={fieldLabelClass}>Webhook URL</div>
                            <input
                              type="password"
                              value={dcWebhookUrl}
                              onChange={(e) => setDcWebhookUrl(e.target.value)}
                              placeholder="https://discord.com/api/webhooks/..."
                              className={inputClass}
                            />
                          </label>

                          {dcName ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 rounded-lg border border-status-ok/20 bg-status-ok-bg px-3 py-2">
                                <div className="h-2 w-2 rounded-full bg-status-ok" />
                                <span className="text-[12px] text-ink">Webhook 有效：{dcName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDcSave()}
                                disabled={dcSaving}
                                className={primaryButtonClass}
                              >
                                {dcSaving ? '保存中...' : '保存并启用'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleDcVerify()}
                              disabled={dcVerifying || !dcWebhookUrl.trim()}
                              className={secondaryButtonClass}
                            >
                              {dcVerifying ? '验证中...' : '验证 Webhook'}
                            </button>
                          )}
                        </>
                      )}

                      {dcStatus && (
                        <div className="text-[12px] text-status-ok">{dcStatus}</div>
                      )}
                      {dcError && (
                        <div className="text-[12px] text-status-danger">{dcError}</div>
                      )}
                    </div>
                  </section>
                )}

                {/* Feishu panel */}
                {activeNotifyChannel === 'feishu' && (
                  <section className={sectionClass}>
                    <div className="space-y-3">
                      {fsChannel && (fsChannel.config as FeishuChannelConfig).webhookUrl ? (
                        <>
                          <div className="flex items-center gap-2 rounded-lg border border-status-ok/20 bg-status-ok-bg px-3 py-2">
                            <div className="h-2 w-2 rounded-full bg-status-ok" />
                            <span className="text-[12px] text-ink">已绑定飞书自定义机器人</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={fsEnabled}
                                onChange={(e) => void handleFsToggle(e.target.checked)}
                                className="h-4 w-4 rounded border-border accent-accent"
                              />
                              <span className="text-[12px] text-ink">启用每日提醒</span>
                            </label>
                          </div>

                          {fsEnabled && (
                            <div>
                              <div className={fieldLabelClass}>每日发送时间</div>
                              <SelectMenu
                                value={fsNotifyHour}
                                options={notifyHourSelectOptions}
                                onChange={(hour) => void handleFsHourChange(hour)}
                                ariaLabel="飞书 每日发送时间"
                                className="max-w-[160px]"
                                buttonClassName={inputClass}
                              />
                              <p className="mt-1.5 text-[11px] leading-4 text-ink2">
                                每天按药箱时区 {timezone} 的此时间检查并发送提醒。
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleFsTest()}
                              disabled={fsTestingSend || !fsEnabled}
                              className={secondaryButtonClass}
                            >
                              {fsTestingSend ? '发送中...' : '发送测试通知'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleFsUnlink()}
                              className={`${secondaryButtonClass} text-status-danger`}
                            >
                              解除绑定
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-[12px] leading-[1.5] text-ink2">
                            通过飞书自定义机器人接收过期提醒。在飞书群设置中添加自定义机器人，复制 Webhook 地址后填入下方。
                          </p>

                          <label className="block">
                            <div className={fieldLabelClass}>Webhook URL</div>
                            <input
                              type="password"
                              value={fsWebhookUrl}
                              onChange={(e) => setFsWebhookUrl(e.target.value)}
                              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                              className={inputClass}
                            />
                          </label>

                          <label className="block">
                            <div className={fieldLabelClass}>签名校验密钥（可选）</div>
                            <input
                              type="password"
                              value={fsSecret}
                              onChange={(e) => setFsSecret(e.target.value)}
                              placeholder="留空则不启用签名校验"
                              className={inputClass}
                            />
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleFsVerify()}
                              disabled={fsVerifying || !fsWebhookUrl.trim()}
                              className={secondaryButtonClass}
                            >
                              {fsVerifying ? '验证中...' : '验证 Webhook'}
                            </button>
                            {fsStatus && fsStatus.includes('成功') && (
                              <button
                                type="button"
                                onClick={() => void handleFsSave()}
                                disabled={fsSaving}
                                className={primaryButtonClass}
                              >
                                {fsSaving ? '保存中...' : '保存并启用'}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {fsStatus && (
                        <div className="text-[12px] text-status-ok">{fsStatus}</div>
                      )}
                      {fsError && (
                        <div className="text-[12px] text-status-danger">{fsError}</div>
                      )}
                    </div>
                  </section>
                )}
              </>
            ) : activeTab === 'ai' ? (
              <>
                {aiSetupPrompt && (
                  <section className="rounded-[12px] border border-accent/20 bg-accent/10 p-3 sm:p-3.5">
                    <div className="text-[12px] font-semibold text-ink">首次 AI 配置</div>
                    <p className="mt-1.5 text-[12px] leading-[1.65] text-ink2">
                      当前服务端还没有配置默认 AI。请在这里填写你自己的 AI Base URL、API Key
                      和模型名称；保存后当前浏览器会优先使用这些配置。
                    </p>
                    <div className="mt-2 rounded-[10px] border border-border/50 bg-surface/80 px-3 py-2 font-mono text-[11px] leading-[1.55] text-ink3">
                      建议 Base URL：{aiSetupPrompt.defaultBaseUrl}
                      <br />
                      建议模型：{aiSetupPrompt.defaultModel}
                    </div>
                  </section>
                )}

                <section className={sectionClass}>
                  <div className={sectionTitleClass}>AI 配置</div>
                  <div className="space-y-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="block">
                        <div className={fieldLabelClass}>AI Base URL</div>
                        <input
                          value={form.aiBaseUrl}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, aiBaseUrl: event.target.value }))
                          }
                          placeholder="https://api.openai.com"
                          className={inputClass}
                        />
                      </label>

                      <div className="block">
                        <div className={`${fieldLabelClass} flex items-center gap-1.5`}>
                          <span>模型名称</span>
                          <span className="group/tooltip relative inline-flex">
                            <button
                              type="button"
                              aria-label="模型名称提示"
                              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border/60 bg-surface4 text-ink3 transition-colors hover:border-border-strong/80 hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/25"
                            >
                              <Info aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                            </button>
                            <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 w-44 -translate-y-1/2 rounded-[10px] border border-border/60 bg-tooltip px-2.5 py-2 text-[11px] leading-[1.45] text-white opacity-0 shadow-[0_10px_28px_rgba(26,22,18,0.16)] transition-opacity duration-200 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100">
                              建议使用多模态模型和强模型。
                            </span>
                          </span>
                        </div>
                        <input
                          value={form.aiModel}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, aiModel: event.target.value }))
                          }
                          placeholder="gpt-4o-mini"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <label className="block">
                      <div className={fieldLabelClass}>API Key</div>
                      <input
                        type="password"
                        value={form.aiApiKey}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, aiApiKey: event.target.value }))
                        }
                        placeholder="留空使用服务端环境变量"
                        className={inputClass}
                      />
                    </label>

                    <DismissibleNotice
                      noticeId="settings-ai-storage"
                      title="本地存储提示"
                      className="bg-status-warn-bg/40 px-3 py-2.5 leading-[1.6]"
                    >
                      <p>
                        留空时使用服务端环境变量。若在这里填写，AI Base URL、API Key 和模型名会保存在当前浏览器的
                        localStorage 中，并在每次 AI 请求时随请求头发送给后端。
                      </p>
                    </DismissibleNotice>

                    <DismissibleNotice
                      noticeId="settings-ai-payload"
                      title="AI 外发提示"
                      tone="ok"
                      className="bg-status-ok-bg/60 px-3 py-2.5 leading-[1.6]"
                    >
                      <p>
                        使用 AI 解析时会发送你输入的文本或图片；使用 AI 问答时会发送当前问题和整份药箱数据到已配置的模型接口。
                      </p>
                    </DismissibleNotice>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTest()}
                        disabled={testing || loading}
                        className={secondaryButtonClass}
                      >
                        {testing ? '测试中...' : '测试 API 连通性'}
                      </button>
                      <div className="text-[10px] leading-4 text-ink3">
                        请先测试 API 连通性，确保配置正确。
                      </div>
                    </div>
                  </div>
                </section>

                <section className={sectionClass}>
                  <div className={sectionTitleClass}>AI 行为</div>
                  <div className="space-y-3">
                    <div>
                      <div className={fieldLabelClass}>回答风格</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {aiStyleOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({ ...current, aiResponseStyle: option.value }))
                            }
                            className={`${optionCardClass} ${getOptionCardStateClass(
                              form.aiResponseStyle === option.value,
                            )}`}
                          >
                            <div className="text-[12px] font-medium text-ink">{option.label}</div>
                            <div className="mt-0.5 text-[11px] leading-[1.35] text-ink2">
                              {option.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : activeTab === 'privacy' ? (
              <div className="space-y-5">
                <ul className="space-y-3 text-[13px] leading-[1.7] text-ink2">
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok/60" />
                    药箱数据默认保存在当前部署环境的 SQLite 中；未启用 AI 和通知时不会主动发送到外部服务。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok/60" />
                    使用 AI 解析、拍照识别或问答时，输入文本、图片，以及 AI 问答所需的当前药箱数据会发送到你配置的模型接口。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok/60" />
                    浏览器设置里填写的 AI Base URL、API Key 和模型名会保存在当前浏览器的 localStorage 中，并在每次 AI 请求时通过请求头发给后端。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok/60" />
                    启用通知提醒（Telegram / Discord / 飞书）后，提醒消息中的药品名称、到期日期和状态会发送到对应平台的 API 和你绑定的会话或频道。
                  </li>
                </ul>
              </div>
            ) : activeTab === 'disclaimer' ? (
              <div className="space-y-5">

                <ul className="space-y-3 text-[13px] leading-[1.7] text-ink2">
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn/60" />
                    本应用和 AI 输出仅用于库存整理、有效期追踪和基于已录入信息的检索，不提供医疗服务，也不构成诊断、处方或个体化用药建议。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn/60" />
                    系统不会自动保证识别结果、药品功效匹配、剂量、相互作用、禁忌症、适应证或过敏风险的完整与准确，用药前请务必核对药盒和说明书。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn/60" />
                    儿童、孕妇、老人、慢性病患者、多药并用者，或症状较重、持续不缓解者，不应仅依赖本应用或 AI 自行决策，请咨询医生或药师。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn/60" />
                    出现高热不退、剧烈疼痛、呼吸困难、胸痛、抽搐、明显过敏反应等情况，请立即就医或寻求急救帮助。
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn/60" />
                    因录入错误、模型偏差、提醒延迟、第三方服务处理或自行用药产生的风险与后果，由使用者自行判断并承担。
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-7">
                {/* 业务时区 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-ink3" strokeWidth={1.8} />
                    <span className="text-[14px] font-semibold text-ink">业务时区</span>
                  </div>
                  <div className="rounded-[12px] border border-border/50 bg-surface px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-semibold text-ink">{timezone}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              timezoneConfigured
                                ? 'bg-status-ok-bg text-status-ok'
                                : 'bg-status-warn-bg text-status-warn'
                            }`}
                          >
                            {timezoneConfigured ? '已激活' : '自动回退'}
                          </span>
                          {timezoneLoading && (
                            <span className="text-[11px] text-ink3">加载中...</span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] leading-[1.5] text-ink2">
                          影响过期判断、AI 问答及每日提醒发送时间。
                        </p>
                        {timezoneLoadError && (
                          <div className="mt-1.5 text-[12px] text-status-danger">
                            {timezoneLoadError}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleTimezoneAutoDetect()}
                          disabled={timezoneSaving}
                          className={secondaryButtonClass}
                        >
                          {timezoneSaving ? '检测中...' : '自动检测'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimezoneEditing((v) => !v)}
                          className={primaryButtonClass}
                        >
                          修改时区
                        </button>
                      </div>
                    </div>
                  </div>

                  {timezoneEditing && (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <ComboboxSelect
                          value={timezoneInput}
                          options={timezoneSelectItems}
                          featuredOptions={featuredTimezoneOptions}
                          onChange={(nextTimezone) => setTimezoneInput(nextTimezone)}
                          ariaLabel="选择业务时区"
                          searchPlaceholder="搜索时区，如 Asia/Shanghai"
                          emptyMessage="没有找到匹配的时区"
                          className="flex-1"
                          buttonClassName={inputClass}
                        />
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => void handleTimezoneSave(timezoneInput)}
                            disabled={timezoneSaving}
                            className={primaryButtonClass}
                          >
                            {timezoneSaving ? '保存中...' : '保存'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimezoneEditing(false)}
                            className={secondaryButtonClass}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {timezoneStatus && (
                    <div className="text-[12px] text-status-ok">{timezoneStatus}</div>
                  )}
                  {timezoneError && (
                    <div className="text-[12px] text-status-danger">{timezoneError}</div>
                  )}
                </div>

                {/* 显示偏好 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-ink3" strokeWidth={1.8} />
                    <span className="text-[14px] font-semibold text-ink">显示偏好</span>
                  </div>

                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <div>
                      <div className={fieldLabelClass}>外观主题</div>
                      <div className="inline-flex rounded-[10px] border border-border/50 bg-surface4 p-[3px]">
                        {themeOptions.map((option) => {
                          const ThemeIcon = themeIconMap[option.value];
                          const isSelected = form.themePreference === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  themePreference: option.value,
                                }))
                              }
                              className={`flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                                isSelected
                                  ? 'theme-panel border border-border/60 text-ink shadow-sm'
                                  : 'border border-transparent text-ink2 hover:text-ink'
                              }`}
                            >
                              <ThemeIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className={fieldLabelClass}>默认主页</div>
                      <div className="inline-flex rounded-[10px] border border-border/50 bg-surface4 p-[3px]">
                        {homeTabOptions.map((option) => {
                          const isSelected = form.defaultHomeTab === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  defaultHomeTab: option.value,
                                }))
                              }
                              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                                isSelected
                                  ? 'theme-panel border border-border/60 text-ink shadow-sm'
                                  : 'border border-transparent text-ink2 hover:text-ink'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={fieldLabelClass}>列表默认视图</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {listViewOptions.map((option) => {
                        const ViewIcon = listViewIconMap[option.value];
                        const isSelected = form.defaultListView === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                defaultListView: option.value,
                              }))
                            }
                            className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-all duration-200 ${
                              isSelected
                                ? 'border-accent/30 bg-accent/5'
                                : 'border-border/60 bg-surface hover:border-border-strong/80'
                            }`}
                          >
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                                isSelected
                                  ? 'bg-accent/15 text-accent'
                                  : 'bg-surface3 text-ink3'
                              }`}
                            >
                              <ViewIcon className="h-4 w-4" strokeWidth={1.8} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] font-medium text-ink">
                                {option.label}
                              </div>
                              <div className="text-[11px] leading-[1.35] text-ink2">
                                {option.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 即将过期判定 */}
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-ink">即将过期判定</div>
                  <div className="flex flex-wrap gap-1.5">
                    {reminderDayOptions.map((days) => {
                      const isSelected = form.expiringDays === days;
                      return (
                        <button
                          key={days}
                          type="button"
                          onClick={() =>
                            setForm((current) => ({ ...current, expiringDays: days }))
                          }
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                            isSelected
                              ? 'bg-accent text-white shadow-sm'
                              : 'border border-border/60 bg-surface text-ink2 hover:border-border-strong/80 hover:text-ink'
                          }`}
                        >
                          {days} 天
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-4 text-ink2">
                    有效期在此天数内的药品会被标记为“即将过期”。
                  </p>
                </div>

                {/* 数据管理 */}
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-ink">数据管理</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleExport()}
                      disabled={loading}
                      className={secondaryButtonClass}
                    >
                      导出数据
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className={neutralFilledButtonClass}
                    >
                      导入数据
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(event) => void handleImport(event.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>

            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border/40 px-4 py-3">
            {status && <div className="mb-2 text-[12px] text-status-ok">{status}</div>}
            {testStatus && <div className="mb-2 text-[12px] text-status-ok">{testStatus}</div>}
            {error && <div className="mb-2 text-[12px] text-status-danger">{error}</div>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  updateSettings(form);
                  onClose();
                }}
                className={primaryButtonClass}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
