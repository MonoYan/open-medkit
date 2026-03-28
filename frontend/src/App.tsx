import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { useMedicines } from './hooks/useMedicines';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { getAiConfigStatus } from './lib/api';
import type { Medicine, Settings } from './types';
import {
  AddModal,
  type AddSuccessPayload,
  type MedicineDraft,
} from './components/AddModal';
import { AiPanel } from './components/AiPanel';
import { Layout } from './components/Layout';
import { MedicineDetailModal } from './components/MedicineDetailModal';
import { MedGrid } from './components/MedGrid';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { StatsRow } from './components/StatsRow';

type MainTab = 'ai' | 'manual';
const AI_SETUP_PROMPT_STORAGE_KEY = 'medkit_ai_setup_prompt_seen';

function hasLocalAiSettings(settings: Settings) {
  return Boolean(
    settings.aiBaseUrl.trim() || settings.aiApiKey.trim() || settings.aiModel.trim(),
  );
}

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { resolvedTheme } = useTheme(settings.themePreference);
  const {
    allMedicines,
    medicines,
    stats,
    loading,
    error,
    filter,
    setFilter,
    refresh,
    addMedicine,
    updateMedicine,
    deleteMedicine,
  } = useMedicines(settings.expiringDays);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [detailMedicine, setDetailMedicine] = useState<Medicine | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>(settings.defaultHomeTab);
  const [manualQuery, setManualQuery] = useState('');
  const [addSuccessMessage, setAddSuccessMessage] = useState('');
  const [aiSetupPrompt, setAiSetupPrompt] = useState<{
    defaultBaseUrl: string;
    defaultModel: string;
  } | null>(null);
  const addSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveTab(settings.defaultHomeTab);
  }, [settings.defaultHomeTab]);

  useEffect(() => {
    return () => {
      if (addSuccessTimerRef.current) {
        clearTimeout(addSuccessTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hasPrompted = window.localStorage.getItem(AI_SETUP_PROMPT_STORAGE_KEY) === '1';

    if (hasPrompted || hasLocalAiSettings(settings)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const configStatus = await getAiConfigStatus();

        if (cancelled || configStatus.hasServerAiConfig) {
          return;
        }

        window.localStorage.setItem(AI_SETUP_PROMPT_STORAGE_KEY, '1');
        setAiSetupPrompt({
          defaultBaseUrl: configStatus.defaultBaseUrl,
          defaultModel: configStatus.defaultModel,
        });
        setSettingsModalOpen(true);
      } catch {
        // Ignore onboarding failures and let the app continue normally.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settings.aiApiKey, settings.aiBaseUrl, settings.aiModel]);

  const handleCreate = async (data: MedicineDraft) => {
    await addMedicine(data);
  };

  const handleUpdate = async (id: number, data: MedicineDraft) => {
    await updateMedicine(id, data);
  };

  const handleDelete = async (medicine: Medicine) => {
    await deleteMedicine(medicine.id);
  };

  const handleOpenAddModal = () => {
    setEditingMedicine(null);
    setAddModalOpen(true);
  };

  const handleCloseSettingsModal = () => {
    setSettingsModalOpen(false);
    setAiSetupPrompt(null);
  };

  const handleCreateSuccess = ({ count, names }: AddSuccessPayload) => {
    const message =
      count <= 1
        ? `${names[0] || '药品'} 已加入药箱`
        : `${count} 条药品已加入药箱`;

    setAddSuccessMessage(message);

    if (addSuccessTimerRef.current) {
      clearTimeout(addSuccessTimerRef.current);
    }

    addSuccessTimerRef.current = setTimeout(() => {
      setAddSuccessMessage('');
      addSuccessTimerRef.current = null;
    }, 2600);
  };

  const filteredMedicines = medicines.filter((medicine) => {
    const query = manualQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const haystack = [
      medicine.name,
      medicine.name_en,
      medicine.spec,
      medicine.quantity,
      medicine.expires_at,
      medicine.category,
      medicine.usage_desc,
      medicine.location,
      medicine.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });

  const hasActiveFilters = Boolean(filter.category || filter.status || manualQuery.trim());

  const handleClearListFilters = () => {
    setFilter((current) => ({ ...current, category: undefined, status: undefined }));
    setManualQuery('');
  };

  const renderSidebar = (onClose?: () => void) => (
    <Sidebar
      stats={stats}
      selectedCategory={filter.category}
      onSelectCategory={(category) => setFilter((current) => ({ ...current, category }))}
      onClose={onClose}
    />
  );

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSidebarOpen(false);
        }}
        resolvedTheme={resolvedTheme}
        onToggleTheme={() =>
          updateSettings({
            themePreference: resolvedTheme === 'dark' ? 'light' : 'dark',
          })
        }
        onOpenSettings={() => {
          setAiSetupPrompt(null);
          setSettingsModalOpen(true);
        }}
        onOpenSidebar={() => setSidebarOpen(true)}
        onAddMedicine={handleOpenAddModal}
      >
        <section
          className={activeTab === 'ai' ? 'flex min-h-0 flex-1 overflow-hidden' : 'hidden'}
          aria-hidden={activeTab !== 'ai'}
        >
          <AiPanel
            settings={settings}
            medicines={allMedicines}
            medicinesLoading={loading}
            onAddMedicine={handleOpenAddModal}
          />
        </section>

        <section
          className={activeTab === 'manual' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}
          aria-hidden={activeTab !== 'manual'}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-5">
            <div className="px-1">
              <h2 className="text-[26px] font-semibold leading-none text-ink md:text-[30px]">
                药品列表
              </h2>
              <div className="mt-2.5">
                <StatsRow stats={stats} expiringDays={settings.expiringDays} />
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:gap-5">
              <aside className="hidden min-h-0 overflow-y-auto md:block">
                {renderSidebar()}
              </aside>
              <div className="min-h-0 min-w-0 flex-1">
                <MedGrid
                  medicines={filteredMedicines}
                  stats={stats}
                  loading={loading}
                  error={error}
                  expiringDays={settings.expiringDays}
                  defaultViewMode={settings.defaultListView}
                  searchQuery={manualQuery}
                  selectedCategory={filter.category}
                  selectedStatus={filter.status}
                  hasActiveFilters={hasActiveFilters}
                  onSearchQueryChange={setManualQuery}
                  onStatusChange={(status) => setFilter((current) => ({ ...current, status }))}
                  onClearFilters={handleClearListFilters}
                  onOpenMedicine={(medicine) => setDetailMedicine(medicine)}
                  onEditMedicine={(medicine) => {
                    setEditingMedicine(medicine);
                    setAddModalOpen(true);
                  }}
                  onDeleteMedicine={handleDelete}
                />
              </div>
            </div>
          </div>
        </section>
      </Layout>

      {sidebarOpen && activeTab === 'manual' && (
        <div className="fixed inset-0 z-40 bg-overlay/60 md:hidden">
          <div className="absolute inset-0" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <div className="relative h-full w-[84vw] max-w-[320px] overflow-y-auto bg-bg shadow-2xl">
            {renderSidebar(() => setSidebarOpen(false))}
          </div>
        </div>
      )}

      {addSuccessMessage && (
        <div className="pointer-events-none fixed inset-x-4 top-20 z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:top-20 sm:justify-end">
          <div
            role="status"
            aria-live="polite"
            className="flex w-full max-w-sm items-start gap-3 rounded-[20px] border border-status-ok/20 bg-status-ok-bg px-4 py-3 text-status-ok shadow-alert animate-fadeUp"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-ok/10">
              <CheckCircle2 aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-status-ok">添加成功</div>
              <p className="mt-1 text-[13px] leading-5 text-ink2">{addSuccessMessage}</p>
            </div>
          </div>
        </div>
      )}

      <AddModal
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setEditingMedicine(null);
        }}
        initialData={editingMedicine || undefined}
        medicineId={editingMedicine?.id}
        settings={settings}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onCreateSuccess={handleCreateSuccess}
      />

      <MedicineDetailModal
        medicine={detailMedicine}
        expiringDays={settings.expiringDays}
        onClose={() => setDetailMedicine(null)}
        onEdit={(medicine) => {
          setDetailMedicine(null);
          setEditingMedicine(medicine);
          setAddModalOpen(true);
        }}
        onDelete={async (medicine) => {
          await handleDelete(medicine);
          setDetailMedicine(null);
        }}
      />

      <SettingsModal
        open={settingsModalOpen}
        onClose={handleCloseSettingsModal}
        settings={settings}
        resolvedTheme={resolvedTheme}
        updateSettings={updateSettings}
        onImported={refresh}
        aiSetupPrompt={aiSetupPrompt}
      />
    </>
  );
}
