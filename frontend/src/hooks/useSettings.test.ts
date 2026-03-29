import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useSettings } from './useSettings';

const STORAGE_KEY = 'medkit_settings';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('returns default settings when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.aiBaseUrl).toBe('');
    expect(result.current.settings.aiApiKey).toBe('');
    expect(result.current.settings.aiModel).toBe('');
    expect(result.current.settings.expiringDays).toBe(30);
    expect(result.current.settings.aiResponseStyle).toBe('concise');
  });

  it('reads stored settings from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ aiApiKey: 'saved-key', expiringDays: 14 }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.aiApiKey).toBe('saved-key');
    expect(result.current.settings.expiringDays).toBe(14);
    expect(result.current.settings.aiBaseUrl).toBe('');
  });

  it('updates settings and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ aiApiKey: 'new-key' });
    });

    expect(result.current.settings.aiApiKey).toBe('new-key');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.aiApiKey).toBe('new-key');
  });

  it('merges partial updates', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ aiApiKey: 'key1' });
    });

    act(() => {
      result.current.updateSettings({ aiModel: 'model1' });
    });

    expect(result.current.settings.aiApiKey).toBe('key1');
    expect(result.current.settings.aiModel).toBe('model1');
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json!!');
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.aiBaseUrl).toBe('');
    expect(result.current.settings.expiringDays).toBe(30);
  });
});
