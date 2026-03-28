import { LayoutGrid } from 'lucide-react';

import type { Stats } from '../types';

interface SidebarProps {
  stats: Stats;
  selectedCategory?: string;
  onSelectCategory: (category?: string) => void;
  onClose?: () => void;
}

export function Sidebar({
  stats,
  selectedCategory,
  onSelectCategory,
  onClose,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      {onClose && (
        <div className="flex items-center justify-between px-4 pt-4 md:hidden">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink3">药品筛选</div>
          <button
            type="button"
            onClick={onClose}
            className="theme-button-neutral rounded-[8px] border px-3 py-1.5 text-xs transition-all duration-200 active:scale-95"
          >
            关闭
          </button>
        </div>
      )}

      <section className="theme-panel overflow-hidden rounded-[20px] border">
        <div className="border-b border-border/40 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface3 text-ink">
              <LayoutGrid className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink3">
                分类筛选
              </div>
              <p className="mt-1 text-[12px] leading-6 text-ink2">按使用场景浏览药品。</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => {
              onSelectCategory(undefined);
              onClose?.();
            }}
            className={`flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-left text-sm transition-all duration-200 active:scale-[0.98] ${
              !selectedCategory
                ? 'bg-header text-white shadow-sm'
                : 'bg-surface3 text-ink2 hover:bg-surface2 hover:text-ink'
            }`}
          >
            <span className="font-medium">全部药品</span>
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${
                !selectedCategory ? 'bg-white/15 text-white' : 'bg-surface text-ink3'
              }`}
            >
              {stats.total}
            </span>
          </button>

          {stats.categories.map((item) => (
            <button
              key={item.category}
              type="button"
              onClick={() => {
                onSelectCategory(item.category);
                onClose?.();
              }}
              className={`flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-left text-sm transition-all duration-200 active:scale-[0.98] ${
                selectedCategory === item.category
                  ? 'bg-header text-white shadow-sm'
                  : 'bg-surface3 text-ink2 hover:bg-surface2 hover:text-ink'
              }`}
            >
              <span className="font-medium">{item.category}</span>
              <span
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${
                  selectedCategory === item.category ? 'bg-white/15 text-white' : 'bg-surface text-ink3'
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
