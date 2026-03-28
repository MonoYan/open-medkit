import type { Stats } from '../types';

interface StatsRowProps {
  stats: Stats;
  expiringDays: number;
  compact?: boolean;
}

export function StatsRow({ stats, expiringDays }: StatsRowProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[12px] tracking-wide text-ink3">
      <span>
        药品总数{' '}
        <span className="text-[13px] font-semibold text-ink">{stats.total}</span>
      </span>
      {stats.expiring > 0 && (
        <span>
          · {expiringDays}天内过期{' '}
          <span className="text-[13px] font-semibold text-status-warn">{stats.expiring}</span>
        </span>
      )}
      {stats.expired > 0 && (
        <span>
          · 已过期{' '}
          <span className="text-[13px] font-semibold text-status-danger">{stats.expired}</span>
        </span>
      )}
    </div>
  );
}
