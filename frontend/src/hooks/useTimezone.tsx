import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { getAppSettings, setTimezone as setTimezoneRequest } from '../lib/api';
import type { AppSettings } from '../types';

interface TimezoneContextValue {
  timezone: string;
  configured: boolean;
  loading: boolean;
  error: string;
  setTimezone: (timezone: string) => Promise<AppSettings>;
  detectTimezone: () => Promise<AppSettings>;
  refreshTimezone: () => Promise<AppSettings>;
}

const FALLBACK_TIMEZONE = 'UTC';

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

function getBrowserTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === 'string' && timezone.trim() ? timezone : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState(FALLBACK_TIMEZONE);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const applySettings = (settings: AppSettings) => {
    setTimezoneState(settings.timezone);
    setConfigured(settings.configured);
  };

  const refreshTimezone = async () => {
    const settings = await getAppSettings();
    applySettings(settings);
    setError('');
    return settings;
  };

  const setTimezone = async (nextTimezone: string) => {
    const settings = await setTimezoneRequest(nextTimezone);
    applySettings(settings);
    setError('');
    return settings;
  };

  const detectTimezone = async () => setTimezone(getBrowserTimezone());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError('');

      try {
        let settings = await getAppSettings();

        if (!settings.configured) {
          try {
            settings = await setTimezoneRequest(getBrowserTimezone());
          } catch (timezoneError) {
            if (!cancelled) {
              applySettings(settings);
              setError(timezoneError instanceof Error ? timezoneError.message : '同步时区失败');
            }
            return;
          }
        }

        if (!cancelled) {
          applySettings(settings);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '加载时区失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TimezoneContext.Provider
      value={{
        timezone,
        configured,
        loading,
        error,
        setTimezone,
        detectTimezone,
        refreshTimezone,
      }}
    >
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);

  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }

  return context;
}
