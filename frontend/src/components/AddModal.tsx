import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pencil,
  Pill,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

import {
  completeMedicineDraft,
  getCategories,
  parseMedicineBatchStream,
  parseMedicineImageStream,
  parseMedicineStream,
} from '../lib/api';
import type { Medicine, Settings } from '../types';
import { compressImage } from '../lib/utils';
import { DismissibleNotice } from './DismissibleNotice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<Medicine>;
  medicineId?: number;
  settings: Settings;
  onCreate: (data: MedicineDraft) => Promise<void>;
  onUpdate: (id: number, data: MedicineDraft) => Promise<void>;
  onCreateSuccess?: (payload: AddSuccessPayload) => void;
}

export type MedicineDraft = Omit<Medicine, 'id' | 'created_at' | 'updated_at'>;
export interface AddSuccessPayload {
  count: number;
  names: string[];
}

interface BatchDraftItem {
  id: string;
  success: boolean;
  error?: string;
  raw?: string;
  sourceText: string;
  form: MedicineDraft;
  retrying?: boolean;
}

type AnimPhase = 'idle' | 'streaming' | 'streamDone' | 'collapsing' | 'filling' | 'ready';
type AiCompletionField = 'name' | 'name_en' | 'spec' | 'category' | 'usage_desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const emptyDraft: MedicineDraft = {
  name: '',
  name_en: '',
  spec: '',
  quantity: '',
  expires_at: '',
  category: '',
  usage_desc: '',
  location: '',
  notes: '',
};

const CARD_FIELD_ORDER: Array<{ key: keyof MedicineDraft; label: string; wide?: boolean }> = [
  { key: 'spec', label: '规格' },
  { key: 'quantity', label: '剩余数量' },
  { key: 'category', label: '分类' },
  { key: 'location', label: '存放位置' },
  { key: 'usage_desc', label: '用途 / 适应症', wide: true },
  { key: 'notes', label: '备注', wide: true },
];

const ALL_FILL_ORDER: Array<keyof MedicineDraft> = [
  'name',
  'name_en',
  'expires_at',
  ...CARD_FIELD_ORDER.map((f) => f.key),
];

const AI_COMPLETION_FIELDS: AiCompletionField[] = [
  'name',
  'name_en',
  'spec',
  'category',
  'usage_desc',
];

const FILL_STAGGER_MS = 150;
const STREAM_DONE_PAUSE_MS = 1500;
const TYPEWRITER_INTERVAL_MS = 20;
const TYPEWRITER_CHARS_PER_TICK = 2;

const fieldLabels: Array<keyof MedicineDraft> = [
  'name',
  'name_en',
  'spec',
  'quantity',
  'expires_at',
  'category',
  'usage_desc',
  'location',
  'notes',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDraft(data?: Partial<Medicine>): MedicineDraft {
  return {
    ...emptyDraft,
    ...data,
    name: data?.name || '',
    name_en: data?.name_en || '',
    spec: data?.spec || '',
    quantity: data?.quantity || '',
    expires_at: data?.expires_at || '',
    category: data?.category || '',
    usage_desc: data?.usage_desc || '',
    location: data?.location || '',
    notes: data?.notes || '',
  };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded bg-gradient-to-r from-border/60 via-surface3 to-border/60 bg-[length:200%_100%] ${className}`}
    />
  );
}

function HeaderSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded bg-gradient-to-r from-white/15 via-white/25 to-white/15 bg-[length:200%_100%] ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Step Tab
// ---------------------------------------------------------------------------

function StepTab({
  index,
  title,
  active,
  done,
}: {
  index: number;
  title: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-2 rounded-lg border-[1.5px] px-3.5 py-2 transition-all ${
        active
          ? 'border-header bg-header'
          : done
            ? 'border-border bg-surface2'
            : 'border-border bg-surface3'
      }`}
    >
      <div
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
          active
            ? 'bg-white text-header'
            : done
              ? 'bg-border text-ink2'
              : 'bg-surface2 text-ink2'
        }`}
      >
        {index}
      </div>
      <div>
        <div
          className={`font-mono text-[10px] uppercase leading-none tracking-[0.06em] ${
            active ? 'text-white/60' : 'text-ink3'
          }`}
        >
          Step {index}
        </div>
        <div
          className={`mt-0.5 text-[13px] font-medium leading-none ${
            active ? 'text-white' : 'text-ink2'
          }`}
        >
          {title}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Stream Box
// ---------------------------------------------------------------------------

function AiStreamBox({
  visible,
  streamText,
  isStreaming,
  isDone,
  isCollapsing,
  onCollapseEnd,
}: {
  visible: boolean;
  streamText: string;
  isStreaming: boolean;
  isDone: boolean;
  isCollapsing: boolean;
  onCollapseEnd: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText]);

  if (!visible && !isCollapsing) return null;

  return (
    <div
      className={`origin-top overflow-hidden rounded-[10px] border border-violet/35 bg-violet-bg/20 px-4 py-3.5 transition-all duration-300 ${
        visible && !isCollapsing ? 'opacity-100' : ''
      } ${!visible && !isCollapsing ? 'translate-y-1.5 opacity-0' : ''} ${
        isCollapsing ? 'animate-collapseBox' : ''
      }`}
      onAnimationEnd={(e) => {
        if (e.animationName === 'collapseBox') onCollapseEnd();
      }}
    >
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-violet">
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            isDone ? 'bg-status-ok' : 'animate-pulseDot bg-violet'
          }`}
        />
        <span>{isDone ? 'AI 解析完成' : 'AI 正在解析'}</span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[200px] overflow-y-auto font-mono text-[12.5px] leading-[1.7] text-violet-ink"
      >
        <span className="whitespace-pre-wrap break-all">{streamText}</span>
        {isStreaming && (
          <span className="ml-0.5 inline-block h-[13px] w-0.5 animate-blinkCursor bg-violet align-middle" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medicine Preview Card
// ---------------------------------------------------------------------------

function MedicinePreviewCard({
  draft,
  visible,
  filledFields,
  showActions,
  editFormOpen,
  onToggleEdit,
  onAiSupplement,
  aiSupplementLoading,
  categories,
  onFieldChange,
  onRemove,
}: {
  draft: MedicineDraft;
  visible: boolean;
  filledFields: Set<string>;
  showActions: boolean;
  editFormOpen: boolean;
  onToggleEdit: () => void;
  onAiSupplement: () => void;
  aiSupplementLoading: boolean;
  categories: string[];
  onFieldChange: (key: keyof MedicineDraft, value: string) => void;
  onRemove?: () => void;
}) {
  if (!visible) return null;

  const nameShown = filledFields.has('name');
  const enShown = filledFields.has('name_en');
  const expiryShown = filledFields.has('expires_at');

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fadeUp overflow-hidden rounded-xl border-[1.5px] border-border bg-surface">
        {/* Dark header */}
        <div className="theme-header-gradient flex items-center justify-between px-[18px] py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-white/15 text-white">
              <Pill className="h-[18px] w-[18px]" strokeWidth={2} />
            </div>
            <div>
              <div className="min-w-[80px] font-body text-[17px] font-semibold text-white">
                {nameShown ? (
                  draft.name || '—'
                ) : (
                  <HeaderSkeleton className="h-[18px] w-24" />
                )}
              </div>
              <div className="mt-0.5 min-w-[60px] font-mono text-[11px] text-white/55">
                {enShown ? (
                  draft.name_en || '—'
                ) : (
                  <HeaderSkeleton className="mt-1 h-[10px] w-16" />
                )}
              </div>
            </div>
          </div>
          <div className="min-w-[70px] rounded-md border border-white/20 bg-white/[0.12] px-2.5 py-1 font-mono text-[11px] text-white/70">
            {expiryShown ? (
              draft.expires_at ? (
                `有效期 ${draft.expires_at.replace(/-/g, '/')}`
              ) : (
                '—'
              )
            ) : (
              <HeaderSkeleton className="h-3 w-20" />
            )}
          </div>
        </div>

        {/* Fields grid */}
        <div className="px-[18px] py-3.5">
          <div className="grid grid-cols-2 gap-2">
            {CARD_FIELD_ORDER.map((field) => (
              <div
                key={field.key}
                className={`rounded-[7px] bg-surface2 px-[11px] py-[9px] ${field.wide ? 'col-span-2' : ''}`}
              >
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-ink3">
                  {field.label}
                </div>
                <div className="min-h-[18px] text-[13.5px] leading-[1.4] text-ink">
                  {filledFields.has(field.key) ? (
                    draft[field.key] || '—'
                  ) : (
                    <Skeleton
                      className={`h-4 ${field.wide ? 'w-[95%]' : field.key === 'usage_desc' ? 'h-9 w-[95%]' : 'w-[60%]'}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions row */}
        <div
          className={`flex items-center justify-between border-t border-border/40 px-[18px] py-2.5 transition-opacity duration-300 ${
            showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleEdit}
              className={`flex items-center gap-1.5 rounded-[7px] border-[1.5px] px-3 py-1.5 text-[12px] font-medium transition-all ${
                editFormOpen
                  ? 'border-header bg-header text-white'
                  : 'border-border bg-surface3 text-ink2 hover:border-border-strong hover:bg-surface2 hover:text-ink'
              }`}
            >
              <Pencil className="h-[13px] w-[13px]" strokeWidth={1.9} />
              编辑信息
              <ChevronDown
                className={`ml-0.5 h-[11px] w-[11px] transition-transform duration-300 ${
                  editFormOpen ? 'rotate-180' : ''
                }`}
                strokeWidth={2}
              />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center gap-1 rounded-[7px] border-[1.5px] border-border bg-surface3 px-3 py-1.5 text-[12px] font-medium text-ink2 transition-all hover:border-status-danger/30 hover:bg-status-danger-bg/70 hover:text-status-danger"
              >
                <X className="h-[12px] w-[12px]" strokeWidth={2} />
                移除此条
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onAiSupplement}
            disabled={aiSupplementLoading}
            className="flex items-center gap-1.5 rounded-[7px] border-[1.5px] border-violet/35 bg-violet-bg/20 px-3 py-1.5 text-[12px] font-medium text-violet transition-all hover:border-violet hover:bg-surface hover:shadow-[0_2px_8px_rgba(124,92,191,0.15)] disabled:opacity-50"
          >
            <Sparkles className="h-[14px] w-[14px]" strokeWidth={2} />
            {aiSupplementLoading ? 'AI 优化中...' : 'AI 优化'}
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      <InlineEditForm
        open={editFormOpen}
        draft={draft}
        categories={categories}
        onChange={onFieldChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Edit Form (collapsible, below card)
// ---------------------------------------------------------------------------

function InlineEditForm({
  open,
  draft,
  categories,
  onChange,
}: {
  open: boolean;
  draft: MedicineDraft;
  categories: string[];
  onChange: (key: keyof MedicineDraft, value: string) => void;
}) {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && formRef.current) {
      const timer = setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const categoryOptions =
    draft.category && !categories.includes(draft.category)
      ? [...categories, draft.category]
      : categories;

  const inputCls =
    'theme-input w-full rounded-[7px] border-[1.5px] px-[11px] py-2 text-[13.5px] outline-none transition-colors';
  const labelCls = 'text-[11px] font-medium text-ink2';

  return (
    <div
      ref={formRef}
      className={`grid transition-all duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] -translate-y-1.5 opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col gap-3 pb-0.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>药品名称</label>
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => onChange('name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>英文名</label>
              <input
                className={inputCls}
                value={draft.name_en}
                onChange={(e) => onChange('name_en', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>规格</label>
              <input
                className={inputCls}
                value={draft.spec}
                onChange={(e) => onChange('spec', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>有效期</label>
              <input
                className={inputCls}
                type="date"
                value={draft.expires_at}
                onChange={(e) => onChange('expires_at', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>剩余数量</label>
              <input
                className={inputCls}
                value={draft.quantity}
                onChange={(e) => onChange('quantity', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>存放位置</label>
              <input
                className={inputCls}
                value={draft.location}
                onChange={(e) => onChange('location', e.target.value)}
                placeholder="如：药箱第一层"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>分类</label>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {categoryOptions.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onChange('category', draft.category === cat ? '' : cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-all ${
                    draft.category === cat
                      ? 'border-status-ok bg-status-ok text-white'
                      : 'border-status-ok/30 bg-status-ok-bg/55 text-status-ok hover:bg-status-ok-bg/80'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>用途 / 适应症</label>
            <textarea
              className={`${inputCls} min-h-[70px] resize-y`}
              value={draft.usage_desc}
              onChange={(e) => onChange('usage_desc', e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>备注</label>
            <textarea
              className={`${inputCls} min-h-[50px] resize-y`}
              value={draft.notes}
              onChange={(e) => onChange('notes', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Fields (reused for batch review, manual mode, edit mode)
// ---------------------------------------------------------------------------

function baseInputClasses(flash: boolean) {
  return `theme-input w-full rounded-[7px] border-[1.5px] px-[11px] py-2 text-[13.5px] outline-none transition focus:border-accent ${
    flash ? 'animate-flashField border-status-ok' : 'border-border'
  }`;
}

function Field({
  label,
  children,
  span = 'col-span-1',
}: {
  label: string;
  children: ReactNode;
  span?: string;
}) {
  return (
    <label className={`${span} block`}>
      <div className="mb-1 text-[11px] font-medium text-ink2">{label}</div>
      {children}
    </label>
  );
}

function DraftFields({
  draft,
  categories,
  onChange,
  flashFields,
}: {
  draft: MedicineDraft;
  categories: string[];
  onChange: (key: keyof MedicineDraft, value: string) => void;
  flashFields?: Set<string>;
}) {
  const categoryOptions =
    draft.category && !categories.includes(draft.category)
      ? [...categories, draft.category]
      : categories;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="药品名称">
        <input
          value={draft.name}
          onChange={(e) => onChange('name', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('name')))}
        />
      </Field>

      <Field label="英文名">
        <input
          value={draft.name_en}
          onChange={(e) => onChange('name_en', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('name_en')))}
        />
      </Field>

      <Field label="规格">
        <input
          value={draft.spec}
          onChange={(e) => onChange('spec', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('spec')))}
        />
      </Field>

      <Field label="有效期">
        <input
          type="date"
          value={draft.expires_at}
          onChange={(e) => onChange('expires_at', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('expires_at')))}
        />
      </Field>

      <Field label="剩余数量">
        <input
          value={draft.quantity}
          onChange={(e) => onChange('quantity', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('quantity')))}
        />
      </Field>

      <Field label="存放位置">
        <input
          value={draft.location}
          onChange={(e) => onChange('location', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('location')))}
        />
      </Field>

      <Field label="分类">
        <select
          value={draft.category}
          onChange={(e) => onChange('category', e.target.value)}
          className={baseInputClasses(Boolean(flashFields?.has('category')))}
        >
          <option value="">请选择分类</option>
          {categoryOptions.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </Field>

      <Field label="用途/适应症" span="sm:col-span-2">
        <textarea
          value={draft.usage_desc}
          onChange={(e) => onChange('usage_desc', e.target.value)}
          className={`${baseInputClasses(Boolean(flashFields?.has('usage_desc')))} min-h-[70px] resize-y`}
        />
      </Field>

      <Field label="备注" span="sm:col-span-2">
        <textarea
          value={draft.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          className={`${baseInputClasses(Boolean(flashFields?.has('notes')))} min-h-[50px] resize-y`}
        />
      </Field>
    </div>
  );
}

function CompactEditForm({
  draft,
  categories,
  onChange,
  flashFields,
}: {
  draft: MedicineDraft;
  categories: string[];
  onChange: (key: keyof MedicineDraft, value: string) => void;
  flashFields?: Set<string>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const categoryOptions =
    draft.category && !categories.includes(draft.category)
      ? [...categories, draft.category]
      : categories;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      <section className="theme-panel rounded-[18px] border px-4 py-4 sm:px-5">
        <div className="border-b border-border/40 pb-3">
          <h3 className="text-[15px] font-semibold text-ink">关键信息</h3>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="药品名称" span="sm:col-span-2">
            <input
              value={draft.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="例如：布洛芬缓释胶囊"
              className={baseInputClasses(Boolean(flashFields?.has('name')))}
            />
          </Field>

          <Field label="规格">
            <input
              value={draft.spec}
              onChange={(e) => onChange('spec', e.target.value)}
              placeholder="例如：300mg/粒"
              className={baseInputClasses(Boolean(flashFields?.has('spec')))}
            />
          </Field>

          <Field label="有效期">
            <input
              type="date"
              value={draft.expires_at}
              onChange={(e) => onChange('expires_at', e.target.value)}
              className={baseInputClasses(Boolean(flashFields?.has('expires_at')))}
            />
          </Field>

          <Field label="剩余数量">
            <input
              value={draft.quantity}
              onChange={(e) => onChange('quantity', e.target.value)}
              placeholder="例如：20粒"
              className={baseInputClasses(Boolean(flashFields?.has('quantity')))}
            />
          </Field>

          <Field label="分类">
            <select
              value={draft.category}
              onChange={(e) => onChange('category', e.target.value)}
              className={baseInputClasses(Boolean(flashFields?.has('category')))}
            >
              <option value="">请选择分类</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </Field>

          <Field label="存放位置" span="sm:col-span-2">
            <input
              value={draft.location}
              onChange={(e) => onChange('location', e.target.value)}
              placeholder="例如：药箱第一层"
              className={baseInputClasses(Boolean(flashFields?.has('location')))}
            />
          </Field>
        </div>
      </section>

      <section className="theme-panel rounded-[18px] border px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="flex w-full items-center justify-between gap-3 border-b border-border/40 pb-3 text-left"
        >
          <div>
            <h3 className="text-[15px] font-semibold text-ink">补充信息</h3>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink2 transition-transform duration-200 ${
              detailsOpen ? 'rotate-180' : ''
            }`}
            strokeWidth={2}
          />
        </button>

        <div
          className={`grid transition-all duration-200 ${
            detailsOpen ? 'grid-rows-[1fr] pt-4 opacity-100' : 'grid-rows-[0fr] pt-0 opacity-70'
          }`}
        >
          <div className="overflow-hidden">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="英文名">
                <input
                  value={draft.name_en}
                  onChange={(e) => onChange('name_en', e.target.value)}
                  placeholder="选填"
                  className={baseInputClasses(Boolean(flashFields?.has('name_en')))}
                />
              </Field>

              <div className="hidden sm:block" />

              <Field label="用途 / 适应症" span="sm:col-span-2">
                <textarea
                  value={draft.usage_desc}
                  onChange={(e) => onChange('usage_desc', e.target.value)}
                  className={`${baseInputClasses(Boolean(flashFields?.has('usage_desc')))} min-h-[84px] resize-y`}
                />
              </Field>

              <Field label="备注" span="sm:col-span-2">
                <textarea
                  value={draft.notes}
                  onChange={(e) => onChange('notes', e.target.value)}
                  className={`${baseInputClasses(Boolean(flashFields?.has('notes')))} min-h-[72px] resize-y`}
                />
              </Field>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AddModal({
  open,
  onClose,
  initialData,
  medicineId,
  settings,
  onCreate,
  onUpdate,
  onCreateSuccess,
}: AddModalProps) {
  const isEditMode = typeof medicineId === 'number';

  // --- State ---
  const [step, setStep] = useState<1 | 2>(1);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const [streamText, setStreamText] = useState('');
  const [draft, setDraft] = useState<MedicineDraft>(normalizeDraft(initialData));
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [filledFields, setFilledFields] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [aiText, setAiText] = useState('');
  const [batchItems, setBatchItems] = useState<BatchDraftItem[]>([]);
  const [batchActiveIndex, setBatchActiveIndex] = useState(0);
  const [batchEditOpen, setBatchEditOpen] = useState<Record<string, boolean>>({});
  const [batchEnhancingId, setBatchEnhancingId] = useState<string | null>(null);
  const [isBatchReview, setIsBatchReview] = useState(false);
  const [reviewMode, setReviewMode] = useState<'ai' | 'manual'>('ai');
  const [flashFields, setFlashFields] = useState<Set<string>>(new Set());
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageCompressing, setImageCompressing] = useState(false);
  const [photoExpiresAt, setPhotoExpiresAt] = useState('');
  const [photoLocation, setPhotoLocation] = useState('');

  // --- Refs ---
  const abortRef = useRef<AbortController | null>(null);
  const fillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawStreamRef = useRef('');
  const displayedLenRef = useRef(0);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamDoneDataRef = useRef<Partial<Medicine> | null>(null);
  const batchStreamDoneRef = useRef<BatchDraftItem[] | null>(null);
  const batchSourceLinesRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Reset on open ---
  useEffect(() => {
    if (!open) return;

    setStep(1);
    setAnimPhase('idle');
    setStreamText('');
    setDraft(normalizeDraft(initialData));
    setEditFormOpen(false);
    setFilledFields(new Set());
    setError('');
    setSaving(false);
    setEnhancing(false);
    setAiText('');
    setBatchItems([]);
    setBatchActiveIndex(0);
    setBatchEditOpen({});
    setBatchEnhancingId(null);
    setIsBatchReview(false);
    setReviewMode('ai');
    setFlashFields(new Set());
    setImageDataUrl(null);
    setImageCompressing(false);
    setPhotoExpiresAt('');
    setPhotoLocation('');

    void getCategories()
      .then((cats) => setCategories(cats))
      .catch((err) => setError(err instanceof Error ? err.message : '加载分类失败'));
  }, [open, medicineId, initialData]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (fillTimerRef.current) clearTimeout(fillTimerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  if (!open) return null;

  // --- Derived ---
  const effectiveLines = aiText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const isBatchInput = !isEditMode && !imageDataUrl && effectiveLines.length > 1;
  const hasImageInput = Boolean(imageDataUrl);
  const isSingleAiMode = !isEditMode && step === 2 && !isBatchReview && reviewMode === 'ai';
  const isBatchAiMode = !isEditMode && step === 2 && isBatchReview;
  const isManualMode = !isEditMode && step === 2 && !isBatchReview && reviewMode === 'manual';
  const activeBatchItem = isBatchAiMode ? batchItems[batchActiveIndex] : null;

  // --- Helpers ---
  const clearTimers = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (fillTimerRef.current) {
      clearTimeout(fillTimerRef.current);
      fillTimerRef.current = null;
    }
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    rawStreamRef.current = '';
    displayedLenRef.current = 0;
    streamDoneDataRef.current = null;
  };

  const flashFieldNames = (fields: Iterable<string>) => {
    const next = new Set(fields);
    if (next.size === 0) return;
    setFlashFields(next);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashFields(new Set()), 500);
  };

  const updateDraftField = (key: keyof MedicineDraft, value: string) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  // --- Field fill sequence ---
  const startFieldFill = () => {
    let idx = 0;
    const fill = () => {
      if (idx >= ALL_FILL_ORDER.length) {
        setAnimPhase('ready');
        return;
      }
      const fieldKey = ALL_FILL_ORDER[idx];
      setFilledFields((prev) => new Set([...prev, fieldKey]));
      idx++;
      fillTimerRef.current = setTimeout(fill, FILL_STAGGER_MS);
    };
    fill();
  };

  // --- Image handler ---
  const handleImageFile = async (file: File) => {
    setError('');
    setImageCompressing(true);
    try {
      const dataUrl = await compressImage(file, 1024, 0.8);
      setImageDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败');
    } finally {
      setImageCompressing(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleImageFile(file);
    e.target.value = '';
  };

  // --- Shared streaming setup ---
  const initStreaming = () => {
    clearTimers();
    setStreamText('');
    setFilledFields(new Set());
    setEditFormOpen(false);
    setStep(2);
    setReviewMode('ai');
    setAnimPhase('streaming');
    rawStreamRef.current = '';
    displayedLenRef.current = 0;
    streamDoneDataRef.current = null;
    batchStreamDoneRef.current = null;
  };

  const makeTypewriter = (controller: AbortController, onDone: () => void) => {
    const startTypewriter = () => {
      if (typewriterRef.current) return;
      typewriterRef.current = setInterval(() => {
        const raw = rawStreamRef.current;
        const cur = displayedLenRef.current;
        if (cur < raw.length) {
          const next = Math.min(cur + TYPEWRITER_CHARS_PER_TICK, raw.length);
          displayedLenRef.current = next;
          setStreamText(raw.slice(0, next));
        } else if (streamDoneDataRef.current || batchStreamDoneRef.current) {
          if (typewriterRef.current) {
            clearInterval(typewriterRef.current);
            typewriterRef.current = null;
          }
          setStreamText(raw);
          onDone();
          setAnimPhase('streamDone');
          phaseTimerRef.current = setTimeout(() => {
            if (controller.signal.aborted) return;
            setAnimPhase('collapsing');
          }, STREAM_DONE_PAUSE_MS);
        }
      }, TYPEWRITER_INTERVAL_MS);
    };

    return (chunk: string) => {
      rawStreamRef.current += chunk;
      startTypewriter();
    };
  };

  // --- Handlers ---
  const handleParse = async () => {
    setError('');

    if (isBatchInput) {
      initStreaming();

      const controller = new AbortController();
      abortRef.current = controller;

      setIsBatchReview(true);
      setBatchActiveIndex(0);
      setBatchEditOpen({});
      setBatchEnhancingId(null);
      batchSourceLinesRef.current = effectiveLines;

      const onBatchDone = () => {
        const items = batchStreamDoneRef.current;
        if (items) {
          setBatchItems(items);
          batchStreamDoneRef.current = null;
        }
      };

      const onStreamChunk = makeTypewriter(controller, onBatchDone);

      try {
        const response = await parseMedicineBatchStream(
          aiText,
          settings,
          onStreamChunk,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        const items: BatchDraftItem[] = response.results.map((result, i) => ({
          id: `${i}-${Date.now()}`,
          success: result.success,
          error: result.error,
          raw: result.raw,
          sourceText: batchSourceLinesRef.current[i] || result.raw || '',
          form: normalizeDraft(result.medicine),
        }));

        batchStreamDoneRef.current = items;

        if (!typewriterRef.current) {
          setBatchItems(items);
          setAnimPhase('streamDone');
          phaseTimerRef.current = setTimeout(() => {
            if (controller.signal.aborted) return;
            setAnimPhase('collapsing');
          }, STREAM_DONE_PAUSE_MS);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (typewriterRef.current) {
          clearInterval(typewriterRef.current);
          typewriterRef.current = null;
        }
        setError(err instanceof Error ? err.message : 'AI 解析失败');
        setAnimPhase('idle');
        setIsBatchReview(false);
        setStep(1);
      }
      return;
    }

    // Single item — use streaming with typewriter buffer
    initStreaming();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsBatchReview(false);

    const onSingleDone = () => {
      const parsed = streamDoneDataRef.current;
      if (parsed) {
        const normalized = normalizeDraft(parsed);
        if (hasImageInput) {
          if (photoExpiresAt) normalized.expires_at = photoExpiresAt;
          if (photoLocation) normalized.location = photoLocation;
        }
        setDraft(normalized);
        streamDoneDataRef.current = null;
      }
    };

    const onStreamChunk = makeTypewriter(controller, onSingleDone);

    try {
      const parsed = hasImageInput
        ? await parseMedicineImageStream(imageDataUrl!, settings, onStreamChunk, controller.signal)
        : await parseMedicineStream(aiText, settings, onStreamChunk, controller.signal);

      if (controller.signal.aborted) return;

      streamDoneDataRef.current = parsed;
      if (!typewriterRef.current) {
        const normalized = normalizeDraft(parsed);
        if (hasImageInput) {
          if (photoExpiresAt) normalized.expires_at = photoExpiresAt;
          if (photoLocation) normalized.location = photoLocation;
        }
        setDraft(normalized);
        setAnimPhase('streamDone');
        phaseTimerRef.current = setTimeout(() => {
          if (controller.signal.aborted) return;
          setAnimPhase('collapsing');
        }, STREAM_DONE_PAUSE_MS);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
      setError(err instanceof Error ? err.message : 'AI 解析失败');
      setAnimPhase('idle');
      setStep(1);
    }
  };

  const handleCollapseEnd = () => {
    setAnimPhase('filling');
    startFieldFill();
  };

  const handleManualReview = () => {
    clearTimers();
    setDraft(normalizeDraft());
    setBatchItems([]);
    setBatchActiveIndex(0);
    setBatchEditOpen({});
    setBatchEnhancingId(null);
    setError('');
    setReviewMode('manual');
    setIsBatchReview(false);
    setEditFormOpen(false);
    setAnimPhase('idle');
    setStep(2);
  };

  const handleBackToStep1 = () => {
    clearTimers();
    setStep(1);
    setAnimPhase('idle');
    setStreamText('');
    setFilledFields(new Set());
    setEditFormOpen(false);
    setError('');
    setDraft(normalizeDraft());
    setBatchItems([]);
    setBatchActiveIndex(0);
    setBatchEditOpen({});
    setBatchEnhancingId(null);
    setIsBatchReview(false);
    setReviewMode('ai');
  };

  const handleAiSupplement = async () => {
    setEnhancing(true);
    setError('');

    try {
      const completed = await completeMedicineDraft(draft, settings, aiText);

      setDraft((cur) => {
        const changed = new Set<string>();
        const next = { ...cur };

        AI_COMPLETION_FIELDS.forEach((field) => {
          const val = completed[field];
          if (typeof val !== 'string' || !val.trim()) return;
          if (cur[field] !== val) {
            next[field] = val;
            changed.add(field);
          }
        });

        // Re-fill the changed fields on the card
        if (changed.size > 0) {
          setFilledFields((prev) => new Set([...prev, ...changed]));
        }

        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 补全失败');
    } finally {
      setEnhancing(false);
    }
  };

  const handleBatchAiSupplement = async (itemId: string) => {
    const item = batchItems.find((i) => i.id === itemId);
    if (!item) return;

    setBatchEnhancingId(itemId);
    setError('');

    try {
      const completed = await completeMedicineDraft(item.form, settings, item.sourceText);

      setBatchItems((cur) =>
        cur.map((c) => {
          if (c.id !== itemId) return c;
          const next = { ...c.form };
          AI_COMPLETION_FIELDS.forEach((field) => {
            const val = completed[field];
            if (typeof val === 'string' && val.trim() && c.form[field] !== val) {
              next[field] = val;
            }
          });
          return { ...c, form: next };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 补全失败');
    } finally {
      setBatchEnhancingId(null);
    }
  };

  const handleRetryBatchItem = async (itemId: string) => {
    const item = batchItems.find((i) => i.id === itemId);
    if (!item) return;

    setBatchItems((cur) =>
      cur.map((c) => (c.id === itemId ? { ...c, retrying: true, error: undefined } : c)),
    );

    try {
      const parsed = await parseMedicineStream(
        item.sourceText,
        settings,
        () => {},
      );

      setBatchItems((cur) =>
        cur.map((c) =>
          c.id === itemId
            ? { ...c, success: true, retrying: false, form: normalizeDraft(parsed) }
            : c,
        ),
      );
    } catch (err) {
      setBatchItems((cur) =>
        cur.map((c) =>
          c.id === itemId
            ? {
                ...c,
                retrying: false,
                success: false,
                error: err instanceof Error ? err.message : 'AI 解析失败',
              }
            : c,
        ),
      );
    }
  };

  const handleSaveSingle = async () => {
    if (!draft.name.trim()) {
      setError('药品名称不能为空');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isEditMode && typeof medicineId === 'number') {
        await onUpdate(medicineId, draft);
      } else {
        await onCreate(draft);
        onCreateSuccess?.({
          count: 1,
          names: draft.name.trim() ? [draft.name.trim()] : [],
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBatch = async () => {
    const valid = batchItems.filter((item) => item.success && item.form.name.trim());
    if (valid.length === 0) {
      setError('请至少保留一条带药品名称的记录');
      return;
    }

    setSaving(true);
    setError('');

    const settled = await Promise.allSettled(valid.map((item) => onCreate(item.form)));
    const failedIds = new Set<string>();
    let ok = 0;

    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') ok++;
      else failedIds.add(valid[i].id);
    });

    setSaving(false);

    if (failedIds.size === 0) {
      onCreateSuccess?.({
        count: ok,
        names: valid.map((item) => item.form.name.trim()).filter(Boolean),
      });
      onClose();
      return;
    }

    setBatchItems((cur) => cur.filter((item) => failedIds.has(item.id)));
    setError(`成功添加 ${ok} 条，失败 ${failedIds.size} 条，请检查后重试`);
  };

  // --- Determine if submit is allowed ---
  const canSubmitSingle = isSingleAiMode ? animPhase === 'ready' : true;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 animate-overlayFade bg-overlay/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`theme-modal-shell relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[24px] border animate-modalPop ${
          isEditMode ? 'max-w-[760px]' : 'max-w-[680px]'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/40 px-5 pb-4 pt-5 sm:px-6">
          <div>
            <h2 className="font-body text-xl font-semibold text-ink">
              {isEditMode ? '编辑药品' : '添加药品'}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-ink3">
              {isEditMode
                ? '直接修改关键信息，保存后会立即更新药品列表。'
                : '按两步完成：先描述药品，再确认 AI 整理的结构化信息'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="theme-icon-button rounded-full border p-2 transition-all duration-200"
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* ── Step Tabs ── */}
        {!isEditMode && (
          <div className="flex shrink-0 gap-2.5 border-b border-border/40 bg-surface3 px-6 py-3.5">
            <StepTab index={1} title="输入原始描述" active={step === 1} done={step === 2} />
            <StepTab index={2} title="核对并提交" active={step === 2} done={false} />
          </div>
        )}

        {/* ── Scrollable Body ── */}
        <div
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Step 1: Textarea + Image */}
          {!isEditMode && step === 1 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileInputChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFileInputChange}
              />

              {imageDataUrl ? (
                <>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <span className="inline-block h-[13px] w-[3px] rounded-sm bg-accent" />
                    已选择照片
                  </div>
                  <div className="relative overflow-hidden rounded-[10px] border-[1.5px] border-border bg-surface">
                    <img
                      src={imageDataUrl}
                      alt="药品照片"
                      className="max-h-[240px] w-full object-contain bg-surface2"
                    />
                    <button
                      type="button"
                      onClick={() => setImageDataUrl(null)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-overlay/75 text-white transition-colors hover:bg-overlay/90"
                    >
                      <X className="h-3 w-3" strokeWidth={1.8} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-ink2">有效期</div>
                      <input
                        type="date"
                        value={photoExpiresAt}
                        onChange={(e) => setPhotoExpiresAt(e.target.value)}
                        className="theme-input w-full rounded-[7px] border-[1.5px] px-[11px] py-2 text-[13.5px] outline-none transition-colors"
                        placeholder="选填"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-ink2">存放位置</div>
                      <input
                        value={photoLocation}
                        onChange={(e) => setPhotoLocation(e.target.value)}
                        className="theme-input w-full rounded-[7px] border-[1.5px] px-[11px] py-2 text-[13.5px] outline-none transition-colors"
                        placeholder="如：药箱第一层"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <span className="inline-block h-[13px] w-[3px] rounded-sm bg-accent" />
                    输入药品描述
                  </div>
                  <textarea
                    value={aiText}
                    onChange={(e) => {
                      setAiText(e.target.value);
                      setError('');
                    }}
                    placeholder={
                      '例如：布洛芬缓释胶囊，2027年9月29日，20粒，客厅抽屉\n\n多个药品可换行分隔，会在下一步批量确认。'
                    }
                    className="theme-input min-h-[110px] w-full resize-y rounded-[10px] border-[1.5px] px-3.5 py-3 text-[14px] leading-[1.6] outline-none transition-colors focus:border-accent"
                  />
                </>
              )}

              {/* Photo buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={imageCompressing}
                  className="theme-button-neutral flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-[12px] font-medium transition-all disabled:opacity-50"
                >
                  <Camera className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  拍照识别
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageCompressing}
                  className="theme-button-neutral flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-[12px] font-medium transition-all disabled:opacity-50"
                >
                  <ImagePlus className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  从相册选择
                </button>
                {imageCompressing && (
                  <span className="text-[11px] text-ink3">压缩中...</span>
                )}
              </div>

              <DismissibleNotice
                noticeId="add-modal-ai-privacy"
                title="隐私与核对提示"
                className="bg-status-warn-bg/45"
              >
                <p>
                  {hasImageInput
                    ? '使用图片识别时，所选照片以及你补充的有效期、存放位置会发送到当前配置的模型接口。'
                    : '使用 AI 解析时，你输入的文本会发送到当前配置的模型接口；批量模式会逐条发送。'}
                </p>
                <p>
                  如果你在设置中填写了 AI Base URL、API Key 或模型名，它们会保存在当前浏览器的
                  localStorage 中。
                </p>
                <p>
                  AI 结果可能不完整或出错，请在提交入库前逐项核对药名、剂量、有效期和用途。
                </p>
              </DismissibleNotice>
            </>
          )}

          {/* Step 2: Single AI mode — stream box + card */}
          {isSingleAiMode && (
            <>
              <AiStreamBox
                visible={
                  animPhase === 'streaming' ||
                  animPhase === 'streamDone' ||
                  animPhase === 'collapsing'
                }
                streamText={streamText}
                isStreaming={animPhase === 'streaming'}
                isDone={animPhase === 'streamDone' || animPhase === 'collapsing'}
                isCollapsing={animPhase === 'collapsing'}
                onCollapseEnd={handleCollapseEnd}
              />

              <MedicinePreviewCard
                draft={draft}
                visible={animPhase === 'filling' || animPhase === 'ready'}
                filledFields={filledFields}
                showActions={animPhase === 'ready'}
                editFormOpen={editFormOpen}
                onToggleEdit={() => setEditFormOpen((v) => !v)}
                onAiSupplement={() => void handleAiSupplement()}
                aiSupplementLoading={enhancing}
                categories={categories}
                onFieldChange={updateDraftField}
              />
            </>
          )}

          {/* Step 2: Batch mode — stream box + card carousel */}
          {isBatchAiMode && (
            <>
              <AiStreamBox
                visible={
                  animPhase === 'streaming' ||
                  animPhase === 'streamDone' ||
                  animPhase === 'collapsing'
                }
                streamText={streamText}
                isStreaming={animPhase === 'streaming'}
                isDone={animPhase === 'streamDone' || animPhase === 'collapsing'}
                isCollapsing={animPhase === 'collapsing'}
                onCollapseEnd={handleCollapseEnd}
              />

              {(animPhase === 'filling' || animPhase === 'ready') && batchItems.length > 0 && (
                <div className="flex flex-col gap-3 animate-fadeUp">
                  {/* Centered pagination */}
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBatchActiveIndex((i) => Math.max(0, i - 1))}
                      disabled={batchActiveIndex === 0}
                      className="theme-button-neutral rounded-md border p-1.5 transition-all disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <span className="min-w-[48px] text-center font-mono text-[12px] text-ink2">
                      {batchActiveIndex + 1} / {batchItems.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchActiveIndex((i) => Math.min(batchItems.length - 1, i + 1))
                      }
                      disabled={batchActiveIndex === batchItems.length - 1}
                      className="theme-button-neutral rounded-md border p-1.5 transition-all disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Active card */}
                  {activeBatchItem && (
                    activeBatchItem.success && !activeBatchItem.retrying ? (
                      <MedicinePreviewCard
                        key={activeBatchItem.id}
                        draft={activeBatchItem.form}
                        visible
                        filledFields={animPhase === 'filling' ? filledFields : new Set(ALL_FILL_ORDER)}
                        showActions={animPhase === 'ready'}
                        editFormOpen={!!batchEditOpen[activeBatchItem.id]}
                        onToggleEdit={() =>
                          setBatchEditOpen((cur) => ({
                            ...cur,
                            [activeBatchItem.id]: !cur[activeBatchItem.id],
                          }))
                        }
                        onAiSupplement={() => void handleBatchAiSupplement(activeBatchItem.id)}
                        aiSupplementLoading={batchEnhancingId === activeBatchItem.id}
                        categories={categories}
                        onFieldChange={(key, value) =>
                          setBatchItems((cur) =>
                            cur.map((c) =>
                              c.id === activeBatchItem.id
                                ? { ...c, form: { ...c.form, [key]: value } }
                                : c,
                            ),
                          )
                        }
                        onRemove={batchItems.length > 1 ? () => {
                          const removedIdx = batchActiveIndex;
                          setBatchItems((cur) => cur.filter((c) => c.id !== activeBatchItem.id));
                          setBatchActiveIndex((idx) =>
                            idx >= batchItems.length - 1 ? Math.max(0, idx - 1) : idx > removedIdx ? idx - 1 : idx
                          );
                        } : undefined}
                      />
                    ) : (
                      <div className="animate-fadeUp overflow-hidden rounded-xl border-[1.5px] border-border bg-surface">
                        <div className="theme-header-gradient px-[18px] py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-white/15 text-white">
                              <Pill className="h-[18px] w-[18px]" strokeWidth={2} />
                            </div>
                            <div className="font-body text-[15px] font-medium text-white/70">
                              条目 {batchActiveIndex + 1}
                            </div>
                          </div>
                        </div>
                        <div className="px-[18px] py-5 flex flex-col items-center gap-3">
                          {activeBatchItem.retrying ? (
                            <>
                              <RefreshCw className="h-5 w-5 animate-spin text-status-warn" strokeWidth={2} />
                              <div className="text-[13px] text-ink2">正在重新解析...</div>
                            </>
                          ) : (
                            <>
                              <div className="text-center text-[13px] text-status-danger">
                                解析失败：{activeBatchItem.error || '未知错误'}
                              </div>
                              {activeBatchItem.sourceText && (
                                <div className="w-full rounded-[7px] bg-surface2 px-3 py-2 font-mono text-[11px] leading-[1.6] text-ink2">
                                  {activeBatchItem.sourceText}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleRetryBatchItem(activeBatchItem.id)}
                                className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-status-warn/30 bg-status-warn-bg px-4 py-2 text-[13px] font-medium text-status-warn transition-all hover:bg-status-warn-bg/80"
                              >
                                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                                重试
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {animPhase === 'ready' && batchItems.length === 0 && (
                <div className="rounded-[10px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-ink2">
                  批量条目已全部移除。你可以返回上一步重新解析。
                </div>
              )}
            </>
          )}

          {/* Step 2: Manual mode */}
          {isManualMode && (
            <DraftFields
              draft={draft}
              categories={categories}
              onChange={updateDraftField}
              flashFields={flashFields}
            />
          )}

          {/* Edit mode */}
          {isEditMode && (
            <CompactEditForm
              draft={draft}
              categories={categories}
              onChange={updateDraftField}
              flashFields={flashFields}
            />
          )}

          {/* Error */}
          {error && <div className="text-sm text-status-danger">{error}</div>}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/40 bg-surface3 px-5 py-3.5 sm:px-6">
          {/* Step 1 buttons */}
          {!isEditMode && step === 1 && (
            <>
              <button
                type="button"
                onClick={handleManualReview}
                className="theme-button-secondary rounded-lg border px-4 py-2 text-[13px] font-medium transition-all"
                style={{ display: 'inline-block' }}
              >
                直接手动填写
              </button>
              <button
                type="button"
                onClick={() => void handleParse()}
                disabled={(!aiText.trim() && !hasImageInput) || animPhase === 'streaming'}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hasImageInput
                  ? '识别图片'
                  : isBatchInput
                    ? `AI 解析 (${effectiveLines.length}条)`
                    : 'AI 解析'}
              </button>
            </>
          )}

          {/* Step 2 buttons */}
          {!isEditMode && step === 2 && (
            <>
              <button
                type="button"
                onClick={handleBackToStep1}
                disabled={animPhase === 'streaming'}
                className="theme-button-secondary rounded-lg border px-4 py-2 text-[13px] font-medium transition-all disabled:opacity-40"
              >
                上一步
              </button>
              <button
                type="button"
                onClick={() =>
                  void (isBatchReview ? handleSaveBatch() : handleSaveSingle())
                }
                disabled={
                  saving ||
                  animPhase !== 'ready' ||
                  (isBatchReview && batchItems.length === 0) ||
                  (isSingleAiMode && !canSubmitSingle)
                }
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? '保存中...'
                  : isBatchReview
                    ? `全部添加 (${batchItems.filter((i) => i.success).length}条)`
                    : '确认添加'}
              </button>
            </>
          )}

          {/* Edit mode buttons */}
          {isEditMode && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="theme-button-secondary rounded-lg border px-4 py-2 text-[13px] font-medium transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSingle()}
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? '保存中...' : '保存更改'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
