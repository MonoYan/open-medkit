import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { useDismissedNotice } from '../hooks/useDismissedNotice';

interface DismissibleNoticeProps {
  noticeId: string;
  title: string;
  children: ReactNode;
  className?: string;
  tone?: 'warn' | 'ok';
}

const toneClasses = {
  warn: 'border-status-warn/20',
  ok: 'border-status-ok/15',
} as const;

export function DismissibleNotice({
  noticeId,
  title,
  children,
  className = '',
  tone = 'warn',
}: DismissibleNoticeProps) {
  const { dismissed, dismiss } = useDismissedNotice(noticeId);

  if (dismissed) {
    return null;
  }

  return (
    <div
      className={`relative rounded-[10px] border px-3.5 py-3 text-[11px] leading-[1.65] text-ink2 ${toneClasses[tone]} ${className}`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="关闭提示"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink3 transition-colors hover:bg-overlay/6 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.9} />
      </button>

      <div className="pr-7">
        <div className="font-medium text-ink">{title}</div>
        <div className="mt-1 space-y-1 [&>p]:m-0 [&>ul]:m-0 [&>ul]:space-y-1 [&>ul]:pl-4">
          {children}
        </div>
      </div>
    </div>
  );
}
