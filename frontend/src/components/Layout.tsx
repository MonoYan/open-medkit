import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  MoonStar,
  Plus,
  Settings,
  SlidersHorizontal,
  SunMedium,
  BotIcon,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: 'ai' | 'manual';
  resolvedTheme: 'light' | 'dark';
  onTabChange: (tab: 'ai' | 'manual') => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
  onAddMedicine: () => void;
}

const tabs = [
  { id: 'ai', label: 'AI 检索', icon: BotIcon },
  { id: 'manual', label: '药品列表', icon: LayoutGrid },
] as const satisfies ReadonlyArray<{
  id: 'ai' | 'manual';
  label: string;
  icon: LucideIcon;
}>;

export function Layout({
  children,
  activeTab,
  resolvedTheme,
  onTabChange,
  onToggleTheme,
  onOpenSettings,
  onOpenSidebar,
  onAddMedicine,
}: LayoutProps) {
  const ThemeIcon = resolvedTheme === 'dark' ? SunMedium : MoonStar;
  const themeLabel = resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到暗色模式';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg text-ink transition-colors duration-300">
      <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-header text-white transition-all duration-300">
        <div className="mx-auto max-w-[1480px] px-4 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-y-3 py-3 md:h-16 md:py-0">
            {/* Logo */}
            <div className="flex shrink-0 items-center md:w-[260px]">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-[14px] shadow-sm ring-1 ring-white/10">
                  <img
                    src="/medkit-icon-rounded.png"
                    alt="OpenMedKit icon"
                    className="h-full w-full object-cover"
                  />
                </div>
                <h1 className="truncate text-xl font-bold tracking-tight text-white">OpenMedKit</h1>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center justify-end gap-2 md:order-3 md:w-[260px]">
              {activeTab === 'manual' && (
                <button
                  type="button"
                  onClick={onOpenSidebar}
                  className="inline-flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-lg text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95 md:hidden"
                  aria-label="打开筛选"
                >
                  <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                </button>
              )}

              <button
                type="button"
                onClick={onAddMedicine}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-white shadow-sm transition-all duration-200 hover:bg-accent-hover hover:shadow active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="leading-none mb-[1px]">添加药品</span>
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-lg text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95"
                aria-label={themeLabel}
                title={themeLabel}
              >
                <ThemeIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              </button>


              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-lg text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95"
                aria-label="打开设置"
              >
                <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              </button>
            </div>

            {/* Tabs */}
            <nav className="flex w-full items-center md:w-auto md:order-2 md:flex-1 md:justify-center">
              <div className="flex w-full items-center gap-1 rounded-xl bg-white/5 p-1 md:w-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all duration-200 md:flex-none ${
                        isActive
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                      }`}
                    >
                      <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
                      <span className="leading-none mt-[1px]">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col overflow-hidden px-4 py-5 md:px-5 md:py-5">
        {children}
      </main>
    </div>
  );
}
