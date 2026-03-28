import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { daysUntilExpiry, formatDate, getMedicineStatus, getStatusText } from '../lib/utils';
import type { Medicine } from '../types';

interface MedicineDetailModalProps {
  medicine: Medicine | null;
  expiringDays: number;
  onClose: () => void;
  onEdit: (medicine: Medicine) => void;
  onDelete: (medicine: Medicine) => Promise<void>;
}

function getStatusClasses(status: ReturnType<typeof getMedicineStatus>) {
  if (status === 'expired') {
    return {
      dot: 'bg-status-danger',
      badge: 'bg-status-danger-bg text-status-danger',
      banner: 'border-status-danger/20 bg-status-danger-bg text-status-danger',
    };
  }

  if (status === 'expiring') {
    return {
      dot: 'bg-status-warn',
      badge: 'bg-status-warn-bg text-status-warn',
      banner: 'border-status-warn/20 bg-status-warn-bg text-status-warn',
    };
  }

  if (status === 'ok') {
    return {
      dot: 'bg-status-ok',
      badge: 'bg-status-ok-bg text-status-ok',
      banner: 'border-status-ok/20 bg-status-ok-bg text-status-ok',
    };
  }

  return {
    dot: 'bg-border',
    badge: 'bg-surface2 text-ink2',
    banner: 'border-border bg-surface2 text-ink2',
  };
}

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="theme-panel rounded-[14px] border px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ink3">{label}</div>
      <div className="mt-1.5 text-[14px] leading-5 text-ink">{value}</div>
    </div>
  );
}

function Section({
  title,
  value,
}: {
  title: string;
  value?: string;
}) {
  return (
    <section className="theme-panel-soft rounded-[16px] border px-4 py-3.5">
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink3">{title}</div>
      <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-ink">
        {value?.trim() || '未填写'}
      </div>
    </section>
  );
}

export function MedicineDetailModal({
  medicine,
  expiringDays,
  onClose,
  onEdit,
  onDelete,
}: MedicineDetailModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!medicine) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [medicine, onClose]);

  useEffect(() => {
    setDeleting(false);
    setError('');
  }, [medicine?.id]);

  if (!medicine) {
    return null;
  }

  const status = getMedicineStatus(medicine.expires_at, expiringDays);
  const days = medicine.expires_at ? daysUntilExpiry(medicine.expires_at) : undefined;
  const styles = getStatusClasses(status);

  const handleDelete = async () => {
    if (!window.confirm(`确认删除「${medicine.name}」吗？`)) {
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await onDelete(medicine);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="medicine-detail-title"
    >
      <div
        className="absolute inset-0 animate-overlayFade bg-overlay/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="theme-modal-shell relative z-10 flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] border animate-modalPop">
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
              {medicine.category && (
                <span className="rounded-full bg-surface2 px-3 py-1 text-[11px] font-medium text-ink2">
                  {medicine.category}
                </span>
              )}
              <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${styles.badge}`}>
                {getStatusText(status, days)}
              </span>
            </div>

            <h2
              id="medicine-detail-title"
              className="mt-3 text-[25px] font-semibold leading-tight text-ink"
            >
              {medicine.name}
            </h2>

            {(medicine.name_en || medicine.spec) && (
              <div className="mt-1.5 text-[13px] text-ink2">
                {[medicine.name_en, medicine.spec].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情"
            className="theme-icon-button rounded-full border p-2 transition-all duration-200"
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div className={`rounded-[16px] border px-3.5 py-2.5 text-[13px] ${styles.banner}`}>
            {status === 'expired'
              ? '这款药品已经过期，使用前请谨慎确认并优先清理。'
              : status === 'expiring'
                ? `这款药品将在 ${typeof days === 'number' ? `${days} 天内` : '近期'} 到期，建议尽快留意。`
                : status === 'ok'
                  ? '当前状态良好，详细信息都整理在这里了。'
                  : '还没有填写有效期，建议补充完整信息。'}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <MetaCard label="规格" value={medicine.spec || '未填写'} />
            <MetaCard label="有效期" value={formatDate(medicine.expires_at)} />
            <MetaCard label="剩余数量" value={medicine.quantity || '未填写'} />
            <MetaCard label="存放位置" value={medicine.location || '未填写'} />
          </div>

          <Section title="用途 / 适应症" value={medicine.usage_desc} />
          <Section title="备注" value={medicine.notes} />
        </div>

        <div className="border-t border-border/40 bg-surface/70 px-5 py-3.5">
          {error && <div className="mb-2.5 text-sm text-status-danger">{error}</div>}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onEdit(medicine)}
              className="theme-button-secondary rounded-lg border px-4 py-2 text-[13px] font-medium transition-all"
            >
              编辑药品
            </button>

            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="rounded-lg border border-status-danger/25 bg-status-danger-bg/55 px-4 py-2 text-[13px] font-medium text-status-danger transition-all hover:bg-status-danger-bg/75 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? '删除中...' : '删除药品'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
