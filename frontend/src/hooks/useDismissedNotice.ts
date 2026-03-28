import { useCallback, useState } from 'react';

const STORAGE_KEY = 'medkit_dismissed_notices';

type DismissedNoticeMap = Record<string, true>;

function readDismissedNotices(): DismissedNoticeMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as DismissedNoticeMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDismissedNotice(noticeId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const next: DismissedNoticeMap = {
      ...readDismissedNotices(),
      [noticeId]: true,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors and keep the in-memory dismissed state.
  }
}

export function useDismissedNotice(noticeId: string) {
  const [dismissed, setDismissed] = useState(() => readDismissedNotices()[noticeId] === true);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeDismissedNotice(noticeId);
  }, [noticeId]);

  return { dismissed, dismiss };
}
