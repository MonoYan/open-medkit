export interface Medicine {
  id: number;
  name: string;
  name_en?: string;
  spec?: string;
  quantity?: string;
  expires_at?: string;
  category?: string;
  usage_desc?: string;
  location?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type MedicineStatus = 'expired' | 'expiring' | 'ok' | 'unknown';
export type MedicineFilterStatus = Exclude<MedicineStatus, 'unknown'>;
export type HomeTabPreference = 'ai' | 'manual';
export type ListViewMode = 'grid' | 'list';
export type AiResponseStyle = 'concise' | 'detailed';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Stats {
  total: number;
  expired: number;
  expiring: number;
  ok: number;
  categories: { category: string; count: number }[];
}

export interface Settings {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  defaultHomeTab: HomeTabPreference;
  defaultListView: ListViewMode;
  expiringDays: number;
  aiResponseStyle: AiResponseStyle;
  themePreference: ThemePreference;
}

export interface BatchParseResult {
  results: {
    index: number;
    success: boolean;
    medicine?: Partial<Medicine>;
    error?: string;
    raw?: string;
  }[];
}

export type AiQueryStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'done'; answer: string; medicines: Medicine[] }
  | { type: 'error'; message: string };

// -- Notification channels --

export interface TelegramChannelConfig {
  botToken: string;
  chatId?: string;
  botUsername?: string;
}

export interface NotificationChannel {
  channel_type: string;
  enabled: boolean;
  config: TelegramChannelConfig | Record<string, unknown>;
  notify_hour: number;
  last_notified_date?: string;
}
