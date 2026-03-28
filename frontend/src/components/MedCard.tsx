import { formatDate, getMedicineStatus, getStatusText, daysUntilExpiry } from '../lib/utils';
import type { Medicine } from '../types';

interface MedCardProps {
  medicine: Medicine;
  expiringDays: number;
  onOpen: () => void;
}

function getStatusClasses(status: ReturnType<typeof getMedicineStatus>) {
  if (status === 'expired') {
    return {
      card: 'bg-status-danger-bg/60 border-status-danger/15',
      badge: 'bg-status-danger-bg text-status-danger',
      expiry: 'text-status-danger',
    };
  }

  if (status === 'expiring') {
    return {
      card: 'bg-status-warn-bg/50 border-status-warn/12',
      badge: 'bg-status-warn-bg text-status-warn',
      expiry: 'text-status-warn',
    };
  }

  if (status === 'ok') {
    return {
      card: 'bg-surface border-border',
      badge: 'bg-status-ok-bg text-status-ok',
      expiry: 'text-ink2',
    };
  }

  return {
    card: 'bg-surface border-border',
    badge: 'bg-surface2 text-ink2',
    expiry: 'text-ink3',
  };
}

export function MedCard({ medicine, expiringDays, onOpen }: MedCardProps) {
  const status = getMedicineStatus(medicine.expires_at, expiringDays);
  const days = medicine.expires_at ? daysUntilExpiry(medicine.expires_at) : undefined;
  const styles = getStatusClasses(status);
  const quantity = medicine.quantity || '未填写';
  const location = medicine.location || '未填写';

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[18px] border shadow-[0_16px_40px_rgba(26,22,18,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(26,22,18,0.1)] ${styles.card}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col px-5 py-4 text-left"
      >
        <div className="mb-3 w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 truncate text-[19px] font-semibold leading-tight text-ink">
              {medicine.name}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${styles.badge}`}
            >
              {getStatusText(status, days)}
            </span>
          </div>

          {(medicine.name_en || medicine.spec) && (
            <div className="mt-1 truncate font-mono text-[12px] text-ink3">
              {[medicine.name_en, medicine.spec].filter(Boolean).join(' · ')}
            </div>
          )}

          {medicine.usage_desc ? (
            <div className="mt-2.5 line-clamp-2 h-[2.6rem] text-[13px] leading-[1.3rem] text-ink2">
              {medicine.usage_desc}
            </div>
          ) : (
            <div className="mt-2.5 h-[2.6rem]" />
          )}
        </div>

        <div className="mt-auto w-full space-y-2.5 border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 text-[12px] text-ink3">
            <span className="shrink-0">有效期</span>
            <span className={`truncate text-[13px] ${styles.expiry}`}>
              {formatDate(medicine.expires_at)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-ink3">
            <div className="flex min-w-0 flex-1 items-baseline">
              <span className="w-7 shrink-0">剩余</span>
              <span className="truncate text-[13px] text-ink2">{quantity}</span>
            </div>

            <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden="true" />

            <div className="flex min-w-0 flex-1 items-baseline">
              <span className="w-7 shrink-0">位置</span>
              <span className="truncate text-[13px] text-ink2">{location}</span>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
