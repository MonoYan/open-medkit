import { useEffect, useState } from 'react';
import { LayoutGrid, List, Pencil, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { Medicine, MedicineFilterStatus, Stats } from '../types';
import { formatDate, getMedicineStatus, getStatusText, daysUntilExpiry } from '../lib/utils';
import { MedCard } from './MedCard';

type SortMode = 'expires' | 'created';
type ViewMode = 'grid' | 'list';
type QuickStatusFilter = Extract<MedicineFilterStatus, 'expiring' | 'expired'>;

interface MedGridProps {
  medicines: Medicine[];
  stats: Stats;
  loading: boolean;
  error?: string;
  expiringDays: number;
  defaultViewMode: ViewMode;
  searchQuery: string;
  selectedCategory?: string;
  selectedStatus?: MedicineFilterStatus;
  hasActiveFilters: boolean;
  onSearchQueryChange: (value: string) => void;
  onStatusChange: (status?: MedicineFilterStatus) => void;
  onClearFilters: () => void;
  onOpenMedicine: (medicine: Medicine) => void;
  onEditMedicine: (medicine: Medicine) => void;
  onDeleteMedicine: (medicine: Medicine) => void;
  onRefresh: () => void;
}

export function MedGrid({
  medicines,
  loading,
  error,
  expiringDays,
  defaultViewMode,
  searchQuery,
  selectedCategory,
  selectedStatus,
  hasActiveFilters,
  onSearchQueryChange,
  onStatusChange,
  onClearFilters,
  onOpenMedicine,
  onEditMedicine,
  onDeleteMedicine,
  onRefresh,
}: MedGridProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('expires');
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const activeQuery = searchQuery.trim();

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [defaultViewMode]);

  const statusFilterLabels: Record<QuickStatusFilter, string> = {
    expiring: `${expiringDays}天内过期`,
    expired: '已过期',
  };

  const sortedMedicines = [...medicines].sort((a, b) => {
    if (sortMode === 'created') {
      return b.created_at.localeCompare(a.created_at);
    }

    if (!a.expires_at && !b.expires_at) {
      return 0;
    }

    if (!a.expires_at) {
      return 1;
    }

    if (!b.expires_at) {
      return -1;
    }

    return a.expires_at.localeCompare(b.expires_at);
  });

  return (
    <section className="theme-panel flex h-full min-h-0 flex-col overflow-y-auto rounded-[20px] border">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-surface/95 px-4 py-4 backdrop-blur md:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            {/* Left: Search + status filter */}
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-3 rounded-[14px] border border-border/50 bg-surface4 px-4 py-2.5 text-[12px] text-ink2 transition-all duration-200 focus-within:border-accent focus-within:bg-surface focus-within:shadow-sm sm:max-w-[280px] sm:flex-1">
                <span className="text-ink3">
                  <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                </span>
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder="搜索名称、用途、位置..."
                  className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink3"
                />
              </label>

              <div className="flex rounded-full border border-border/60 bg-transparent p-1 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => onStatusChange(undefined)}
                  className={`rounded-full px-3 py-1.5 transition-all duration-200 ${
                    !selectedStatus
                      ? 'bg-header text-white shadow-sm'
                      : 'text-ink3 hover:bg-surface4 hover:text-ink active:scale-95'
                  }`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange('expiring')}
                  className={`rounded-full px-3 py-1.5 transition-all duration-200 ${
                    selectedStatus === 'expiring'
                      ? 'bg-status-warn text-white shadow-sm'
                      : 'text-ink3 hover:bg-status-warn-bg hover:text-status-warn active:scale-95'
                  }`}
                >
                  {expiringDays}天内过期
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange('expired')}
                  className={`rounded-full px-3 py-1.5 transition-all duration-200 ${
                    selectedStatus === 'expired'
                      ? 'bg-status-danger text-white shadow-sm'
                      : 'text-ink3 hover:bg-status-danger-bg hover:text-status-danger active:scale-95'
                  }`}
                >
                  已过期
                </button>
              </div>
            </div>

            {/* Right: Refresh + View toggle + sort */}
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                title="刷新列表"
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  try { await onRefresh(); } finally { setRefreshing(false); }
                }}
                className="rounded-full border border-border/60 p-1.5 text-ink3 transition-all duration-200 hover:bg-surface4 hover:text-ink active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
              </button>

              <div className="flex rounded-full border border-border/60 bg-transparent p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`rounded-full p-1.5 transition-all duration-200 ${
                    viewMode === 'grid'
                      ? 'bg-header text-white shadow-sm'
                      : 'text-ink3 hover:bg-surface4 hover:text-ink active:scale-95'
                  }`}
                  title="卡片视图"
                >
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`rounded-full p-1.5 transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-header text-white shadow-sm'
                      : 'text-ink3 hover:bg-surface4 hover:text-ink active:scale-95'
                  }`}
                  title="表格视图"
                >
                  <List className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>

              <span className="h-4 w-px bg-border/60" aria-hidden="true" />

              <div className="flex rounded-full border border-border/60 bg-transparent p-1 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setSortMode('expires')}
                  className={`rounded-full px-3 py-1.5 transition-all duration-200 ${
                    sortMode === 'expires'
                      ? 'bg-header text-white shadow-sm'
                      : 'text-ink3 hover:bg-surface4 hover:text-ink active:scale-95'
                  }`}
                >
                  按过期时间
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('created')}
                  className={`rounded-full px-3 py-1.5 transition-all duration-200 ${
                    sortMode === 'created'
                      ? 'bg-header text-white shadow-sm'
                      : 'text-ink3 hover:bg-surface4 hover:text-ink active:scale-95'
                  }`}
                >
                  按添加时间
                </button>
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
              {selectedCategory && (
                <span className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-surface3 px-3 py-1.5 text-[11px] text-ink2">
                  分类 · {selectedCategory}
                </span>
              )}

              {selectedStatus && selectedStatus in statusFilterLabels && (
                <span className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-surface3 px-3 py-1.5 text-[11px] text-ink2">
                  状态 · {statusFilterLabels[selectedStatus as QuickStatusFilter]}
                </span>
              )}

              {activeQuery && (
                <span
                  className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-surface3 px-3 py-1.5 text-[11px] text-ink2"
                  title={activeQuery}
                >
                  <span className="truncate">搜索 · {activeQuery}</span>
                </span>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="theme-button-neutral inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-all duration-200 active:scale-95"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span>清除筛选</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 shrink-0 rounded-[10px] border border-status-danger/20 bg-status-danger-bg px-4 py-3 text-sm text-status-danger md:mx-5">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-4 md:p-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[164px] animate-pulse rounded-[18px] border border-border/40 bg-surface4"
            />
          ))}
        </div>
      ) : sortedMedicines.length === 0 ? (
        <div className="flex flex-1 items-center p-4 md:p-5">
          <div className="w-full rounded-[18px] border border-dashed border-border/60 bg-surface3 px-6 py-16 text-center">
            <div className="text-sm text-ink2">
              {hasActiveFilters
                ? '没有符合当前筛选条件的药品'
                : '药箱是空的，点击添加第一个药品'}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="theme-button-neutral mt-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] transition-all duration-200 active:scale-95"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>返回全部药品</span>
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-4 md:p-5">
          {sortedMedicines.map((medicine, index) => (
            <div
              key={medicine.id}
              className="h-full opacity-0 animate-fadeUp"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <MedCard
                medicine={medicine}
                expiringDays={expiringDays}
                onOpen={() => onOpenMedicine(medicine)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 md:p-5">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border/40 text-[11px] font-medium uppercase tracking-wider text-ink3">
                <th className="pb-2.5 pr-3 font-medium">名称</th>
                <th className="hidden pb-2.5 pr-3 font-medium sm:table-cell">分类</th>
                <th className="pb-2.5 pr-3 font-medium">有效期</th>
                <th className="pb-2.5 pr-3 font-medium">状态</th>
                <th className="hidden pb-2.5 pr-3 font-medium md:table-cell">数量</th>
                <th className="hidden pb-2.5 font-medium lg:table-cell">位置</th>
                <th className="pb-2.5 pl-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedMedicines.map((medicine) => {
                const status = getMedicineStatus(medicine.expires_at, expiringDays);
                const days = medicine.expires_at ? daysUntilExpiry(medicine.expires_at) : undefined;
                const badgeClass =
                  status === 'expired'
                    ? 'bg-status-danger-bg text-status-danger'
                    : status === 'expiring'
                      ? 'bg-status-warn-bg text-status-warn'
                      : status === 'ok'
                        ? 'bg-status-ok-bg text-status-ok'
                        : 'bg-surface2 text-ink2';

                return (
                  <tr
                    key={medicine.id}
                    onClick={() => onOpenMedicine(medicine)}
                    className="cursor-pointer border-b border-border/30 transition-colors hover:bg-surface3"
                  >
                    <td className="max-w-[180px] truncate py-3 pr-3 font-medium text-ink">
                      {medicine.name}
                      {medicine.spec && (
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-ink3">{medicine.spec}</span>
                      )}
                    </td>
                    <td className="hidden py-3 pr-3 text-ink2 sm:table-cell">{medicine.category || '—'}</td>
                    <td className="py-3 pr-3 font-mono text-[12px] text-ink2">{formatDate(medicine.expires_at)}</td>
                    <td className="py-3 pr-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                        {getStatusText(status, days)}
                      </span>
                    </td>
                    <td className="hidden py-3 pr-3 text-ink2 md:table-cell">{medicine.quantity || '—'}</td>
                    <td className="hidden max-w-[120px] truncate py-3 text-ink2 lg:table-cell">{medicine.location || '—'}</td>
                    <td className="py-3 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="编辑"
                          onClick={(e) => { e.stopPropagation(); onEditMedicine(medicine); }}
                          className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-surface4 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          title="删除"
                          onClick={(e) => { e.stopPropagation(); onDeleteMedicine(medicine); }}
                          className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-status-danger-bg hover:text-status-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
