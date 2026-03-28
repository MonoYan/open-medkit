import { useState } from 'react';

import type { Settings } from '../types';

const STORAGE_KEY = 'medkit_settings';

const defaultSettings: Settings = {
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  defaultHomeTab: 'ai',
  defaultListView: 'grid',
  expiringDays: 30,
  aiResponseStyle: 'concise',
  themePreference: 'system',
};

function readInitialSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return defaultSettings;
    }

    return {
      ...defaultSettings,
      ...(JSON.parse(stored) as Partial<Settings>),
    };
  } catch {
    return defaultSettings;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readInitialSettings);

  const updateSettings = (partial: Partial<Settings>) => {
    setSettings((current) => {
      const next = {
        ...current,
        ...partial,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { settings, updateSettings };
}
