import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Pill, Plus, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

import { DismissibleNotice } from './DismissibleNotice';
import { queryMedicines, queryMedicinesStream } from '../lib/api';
import { daysUntilExpiry, formatDate, getMedicineStatus, getStatusText } from '../lib/utils';
import type { Medicine, Settings } from '../types';

interface AiPanelProps {
  initialQuestion?: string;
  settings: Settings;
  medicines?: Medicine[];
  medicinesLoading?: boolean;
  onAddMedicine?: () => void;
}

type AssistantState = 'thinking' | 'streaming' | 'done' | 'error';
type TransitionPhase = 'onboarding' | 'exiting' | 'entering' | 'ready';

interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  medicines?: Medicine[];
  state?: AssistantState;
}

interface QuestionComposerProps {
  input: string;
  loading: boolean;
  variant: 'empty' | 'compact';
  onInputChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
}

interface AssistantMedicineResultsProps {
  medicines: Medicine[];
  expiringDays: number;
}

interface SuggestionChipRowProps {
  chips: string[];
  onSelect: (chip: string) => void;
  className?: string;
}

const MEDICINES_PER_PAGE = 3;

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink3 first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink3 first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink3 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="m-0 leading-[1.85] [&+&]:mt-2.5">{children}</p>,
  ul: ({ children }) => <ul className="my-2 space-y-1.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 space-y-1.5 pl-4">{children}</ol>,
  li: ({ children }) => (
    <li className="pl-1 leading-[1.85] marker:text-accent/70 [&>p]:m-0 [&_ul]:mt-1.5 [&_ul]:space-y-1 [&_ul]:pl-4">
      {children}
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-code-bg px-1.5 py-0.5 font-mono text-[12px] text-accent">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-accent/30 pl-3 text-ink2">{children}</blockquote>
  ),
};

const fallbackSuggestionChips = [
  '帮我总结一下药箱现状',
  '最近快过期的有哪些',
  '有没有退烧药',
  '头疼可以吃什么',
];

const symptomPromptLibrary = [
  { keywords: ['退烧', '发烧', '高烧', '感冒'], question: '有没有退烧药' },
  { keywords: ['头痛', '头疼', '止痛', '偏头痛', '牙痛'], question: '头疼可以吃什么' },
  { keywords: ['喉咙', '咽喉', '咽痛', '嗓子', '咳嗽'], question: '喉咙不舒服可以用什么' },
  { keywords: ['胃', '消化', '腹痛', '腹泻', '恶心', '肠胃'], question: '肠胃不舒服可以用什么' },
  { keywords: ['伤口', '擦伤', '创口', '消毒'], question: '有处理伤口的药吗' },
  { keywords: ['皮肤', '湿疹', '瘙痒', '过敏'], question: '皮肤不舒服可以用什么' },
  { keywords: ['眼', '眼干', '眼痛'], question: '眼睛不舒服能用什么' },
  { keywords: ['维生素', '补剂', '免疫'], question: '有哪些维生素或补剂' },
];

const categoryPromptLibrary = [
  { keywords: ['感冒', '发烧'], question: '感冒发烧类药品有哪些' },
  { keywords: ['外伤'], question: '外伤处理用品有哪些' },
  { keywords: ['慢性病'], question: '慢性病常备药有哪些' },
  { keywords: ['维生素', '补剂'], question: '有哪些维生素或补剂' },
  { keywords: ['皮肤'], question: '皮肤外用药有哪些' },
  { keywords: ['消化'], question: '消化系统用药有哪些' },
];

function addSuggestion(suggestions: string[], seen: Set<string>, question: string) {
  const normalized = question.trim();

  if (!normalized || seen.has(normalized)) {
    return;
  }

  suggestions.push(normalized);
  seen.add(normalized);
}

function buildSuggestionChips(medicines: Medicine[], expiringDays: number) {
  if (medicines.length === 0) {
    return fallbackSuggestionChips;
  }

  const suggestions: string[] = [];
  const seen = new Set<string>();
  const medicineRecords = medicines.map((medicine) => ({
    medicine,
    status: getMedicineStatus(medicine.expires_at, expiringDays),
    corpus: [
      medicine.name,
      medicine.name_en,
      medicine.spec,
      medicine.category,
      medicine.usage_desc,
      medicine.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));

  const expiredCount = medicineRecords.filter(({ status }) => status === 'expired').length;
  const expiringCount = medicineRecords.filter(({ status }) => status === 'expiring').length;
  const unknownExpiryCount = medicineRecords.filter(({ status }) => status === 'unknown').length;

  if (expiredCount > 0) {
    addSuggestion(suggestions, seen, '哪些药已经过期了');
  }

  if (expiringCount > 0) {
    addSuggestion(suggestions, seen, `最近${expiringDays}天内快过期的有哪些`);
  }

  if (unknownExpiryCount > 0) {
    addSuggestion(suggestions, seen, '哪些药还没填写有效期');
  }

  const matchedSymptoms = symptomPromptLibrary
    .map((entry) => ({
      ...entry,
      count: medicineRecords.filter(({ corpus }) =>
        entry.keywords.some((keyword) => corpus.includes(keyword))
      ).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);

  matchedSymptoms.slice(0, 2).forEach((entry) => {
    addSuggestion(suggestions, seen, entry.question);
  });

  const categoryCounts = new Map<string, number>();

  medicines.forEach((medicine) => {
    const category = medicine.category?.trim();

    if (!category) {
      return;
    }

    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  });

  Array.from(categoryCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .forEach(([category]) => {
      const mappedPrompt = categoryPromptLibrary.find((entry) =>
        entry.keywords.some((keyword) => category.includes(keyword))
      )?.question;

      addSuggestion(suggestions, seen, mappedPrompt || `药箱里有哪些${category}类药品`);
    });

  addSuggestion(suggestions, seen, '帮我总结一下药箱现状');

  if (suggestions.length < 4) {
    fallbackSuggestionChips.forEach((chip) => {
      addSuggestion(suggestions, seen, chip);
    });
  }

  return suggestions.slice(0, 4);
}

function getDotClass(status: ReturnType<typeof getMedicineStatus>) {
  if (status === 'expired') {
    return 'bg-status-danger';
  }

  if (status === 'expiring') {
    return 'bg-status-warn';
  }

  if (status === 'ok') {
    return 'bg-status-ok';
  }

  return 'bg-border';
}

function buildMedicineMeta(medicine: Medicine) {
  return [
    medicine.expires_at ? `有效期 ${formatDate(medicine.expires_at)}` : undefined,
    medicine.quantity || undefined,
    medicine.location || undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ThinkingDots() {
  return (
    <span className="ml-1 flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-accent/80 animate-pulseDot"
          style={{ animationDelay: `${index * 0.18}s` }}
        />
      ))}
    </span>
  );
}

function ThinkingBubble() {
  return (
    <div className="animate-softGlow rounded-[14px] rounded-bl-[4px] border border-accent/10 bg-surface p-1.5 text-ink shadow-card">
      <div className="rounded-[12px] bg-surface3 px-4 py-3.5 md:px-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent/80">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseDot" />
        <span>AI 正在思考</span>
        <ThinkingDots />
      </div>
      <div className="mt-2 text-[13px] leading-7 text-ink2">
        正在整理药箱数据、筛选相关药品和注意事项。
      </div>
      </div>
    </div>
  );
}

function SuggestionChipRow({
  chips,
  onSelect,
  className,
}: SuggestionChipRowProps) {
  return (
    <div className={className || 'flex flex-wrap gap-2'}>
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="theme-chip rounded-full border px-3 py-1.5 text-[11px] transition-all duration-200 active:scale-95"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function AssistantMedicineResults({
  medicines,
  expiringDays,
}: AssistantMedicineResultsProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(medicines.length / MEDICINES_PER_PAGE);
  const currentPage = Math.min(page, Math.max(totalPages - 1, 0));
  const pageStart = currentPage * MEDICINES_PER_PAGE;
  const visibleMedicines = medicines.slice(pageStart, pageStart + MEDICINES_PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [medicines]);

  return (
    <div className="mt-3 space-y-2">
      {visibleMedicines.map((medicine) => {
        const status = getMedicineStatus(medicine.expires_at, expiringDays);
        const days = medicine.expires_at ? daysUntilExpiry(medicine.expires_at) : undefined;

        return (
          <div
            key={medicine.id}
            className="flex items-start gap-3 rounded-[10px] border border-border/40 bg-surface px-4 py-3"
          >
            <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getDotClass(status)}`} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{medicine.name}</div>
              <div className="mt-1 text-[11px] text-ink3">
                {buildMedicineMeta(medicine) || '暂无附加信息'}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink2">
                {getStatusText(status, days)}
              </div>
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border/40 bg-surface2/70 px-3 py-2 text-[11px] text-ink2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">
            第 {currentPage + 1} / {totalPages} 页 · 共 {medicines.length} 个药品
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              aria-label="上一页"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>
            <button
              type="button"
              disabled={currentPage === totalPages - 1}
              onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
              aria-label="下一页"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantBubble({
  message,
}: {
  message: ChatMessage;
}) {
  const isStreaming = message.state === 'streaming';
  const isError = message.state === 'error';

  return (
    <div
      className={`rounded-[14px] rounded-bl-[4px] border p-1.5 text-[13px] leading-7 ${
        isError
          ? 'border-status-danger/20 bg-status-danger-bg/35 text-ink shadow-card'
          : 'border-border/40 bg-surface text-ink shadow-card'
      }`}
    >
      {(isStreaming || isError) && (
        <div
          className={`mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] ${
            isError ? 'text-status-danger' : 'text-accent/80'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isError ? 'bg-status-danger' : 'bg-accent animate-pulseDot'
            }`}
          />
          <span>{isError ? '生成已中断' : '实时生成中'}</span>
        </div>
      )}

      <div className="rounded-[12px] bg-surface3 px-4 py-3.5 md:px-5">
        <div className="text-[13px] text-ink">
          <div className="space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown components={markdownComponents}>{message.text}</ReactMarkdown>
            {isStreaming && (
              <span className="ml-0.5 inline-block h-[13px] w-0.5 animate-blinkCursor bg-accent align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionComposer({
  input,
  loading,
  variant,
  onInputChange,
  onSubmit,
}: QuestionComposerProps) {
  const isEmpty = variant === 'empty';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div
        className={
          isEmpty
            ? 'flex items-center gap-3 rounded-full border border-border/60 bg-surface/95 px-4 py-3 shadow-[0_20px_50px_rgba(26,22,18,0.08)] backdrop-blur-sm transition-all duration-200 focus-within:border-accent/40 focus-within:shadow-[0_22px_60px_rgba(200,75,47,0.12)] md:px-5 md:py-4'
            : 'flex items-center gap-2 rounded-[12px] border border-border/60 bg-surface px-4 py-3 shadow-card transition-all duration-200 focus-within:border-accent focus-within:shadow-md'
        }
      >
        {isEmpty && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface4 text-ink2">
            <Search className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
        )}

        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={
            loading
              ? isEmpty
                ? '正在准备新的回答…'
                : '继续提问会中止当前回答…'
              : isEmpty
                ? '问问药箱里有什么，或直接描述症状'
                : '问问你的药箱…'
          }
          className={`w-full bg-transparent outline-none placeholder:text-ink3 ${
            isEmpty ? 'text-[16px] text-ink md:text-[18px]' : 'text-[13px] text-ink'
          }`}
        />

        <button
          type="submit"
          disabled={!input.trim()}
          className={
            isEmpty
              ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-all duration-200 hover:bg-accent-hover hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:bg-accent/55 disabled:hover:shadow-sm disabled:active:scale-100'
              : 'shrink-0 rounded-[9px] bg-accent px-4 py-2 text-[12px] font-medium text-white transition-all duration-200 hover:bg-accent-hover hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100'
          }
          aria-label={loading ? '重新提问' : '发送问题'}
        >
          {isEmpty ? (
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
          ) : (
            <>{loading ? '重新提问' : '发送'}</>
          )}
        </button>
      </div>
    </form>
  );
}

function AiUsageNotice({ compact = false }: { compact?: boolean }) {
  return (
    <DismissibleNotice
      noticeId="ai-query-privacy"
      title="隐私与风险提示"
      className={`rounded-[14px] bg-status-warn-bg/55 px-4 py-3 text-[11px] leading-[1.7] ${
        compact ? '' : 'mt-4 max-w-[760px]'
      }`}
    >
      <p>
        AI 查询会把你的问题和当前药箱数据发送到已配置的模型接口。请勿输入不想外发的敏感信息。
      </p>
      <p>
        回答仅用于药箱整理与检索，不替代医生或药师的诊断、处方或用药建议。
      </p>
    </DismissibleNotice>
  );
}

function OnboardingView({
  phase,
  onAddMedicine,
}: {
  phase: 'onboarding' | 'exiting';
  onAddMedicine?: () => void;
}) {
  return (
    <div
      className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-8 md:px-6 ${
        phase === 'exiting' ? 'animate-onboardingExit pointer-events-none' : 'animate-fadeUp'
      }`}
    >
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-3xl" />

      <div className="relative z-10 flex flex-col items-center text-center">

        <h2 className="text-[26px] font-medium leading-tight text-ink md:text-[40px]">
          药箱还是空的
        </h2>

        <p className="mt-3 max-w-[360px] text-[13px] leading-relaxed text-ink2 md:text-[15px]">
          添加第一个药品后，就可以用 AI 智能查询了
        </p>

        {onAddMedicine && (
          <button
            type="button"
            onClick={onAddMedicine}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-[14px] font-medium text-white shadow-lg transition-all duration-200 hover:bg-accent-hover hover:shadow-xl active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            添加第一个药品
          </button>
        )}

      </div>
    </div>
  );
}

function CelebrationParticles() {
  const colors = [
    'bg-accent', 'bg-status-ok', 'bg-status-warn', 'bg-violet',
    'bg-accent/60', 'bg-status-ok/60', 'bg-status-warn/60', 'bg-violet/60',
  ];

  const particles = [
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i * 45 + 12) * (Math.PI / 180);
      const d = 42 + (i % 3) * 11;
      return {
        tx: Math.cos(a) * d, ty: Math.sin(a) * d,
        w: 4 + (i % 2), h: 4 + (i % 2), round: true,
        color: colors[i % 8], delay: i * 18, dur: 520,
      };
    }),
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 + 5) * (Math.PI / 180);
      const d = 72 + (i % 4) * 12;
      const elongated = i % 4 === 0;
      return {
        tx: Math.cos(a) * d, ty: Math.sin(a) * d,
        w: elongated ? 3 : 5 + (i % 3),
        h: elongated ? 10 + (i % 3) * 3 : 5 + (i % 3),
        round: !elongated,
        color: colors[i % 8], delay: 35 + i * 22, dur: 640,
      };
    }),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i * 45 + 25) * (Math.PI / 180);
      const d = 108 + (i % 3) * 18;
      return {
        tx: Math.cos(a) * d, ty: Math.sin(a) * d,
        w: 3 + (i % 2), h: 3 + (i % 2), round: true,
        color: colors[(i + 2) % 8], delay: 70 + i * 28, dur: 740,
      };
    }),
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
      <div className="absolute h-16 w-16 rounded-full bg-accent/20 animate-centerGlow" />
      {particles.map((p, i) => (
        <span
          key={i}
          className={`absolute ${p.color} animate-confettiPop`}
          style={{
            width: p.w,
            height: p.h,
            borderRadius: p.round ? '50%' : '1.5px',
            '--confetti-tx': `${p.tx}px`,
            '--confetti-ty': `${p.ty}px`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.dur}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function AiPanel({ initialQuestion, settings, medicines = [], medicinesLoading, onAddMedicine }: AiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(1);
  const activeControllerRef = useRef<AbortController | null>(null);
  const hasConversation = messages.length > 0;
  const suggestionChips = buildSuggestionChips(medicines, settings.expiringDays);

  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('ready');
  const prevCountRef = useRef(medicines.length);
  const loadSettledRef = useRef(!medicinesLoading);

  const updateMessage = (id: number, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? updater(message) : message))
    );
  };

  const sendQuestion = async (question: string) => {
    const nextQuestion = question.trim();

    if (!nextQuestion) {
      return;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    const userMessage: ChatMessage = {
      id: messageIdRef.current++,
      role: 'user',
      text: nextQuestion,
    };
    const assistantMessage: ChatMessage = {
      id: messageIdRef.current++,
      role: 'assistant',
      text: '',
      medicines: [],
      state: 'thinking',
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setLoading(true);

    let receivedChunk = false;

    try {
      const response = await queryMedicinesStream(
        nextQuestion,
        settings,
        (event) => {
          if (controller.signal.aborted || event.type !== 'text') {
            return;
          }

          receivedChunk = true;
          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            text: message.text + event.content,
            state: 'streaming',
          }));
        },
        controller.signal
      );

      if (controller.signal.aborted) {
        return;
      }

      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        text: response.answer,
        medicines: response.medicines,
        state: 'done',
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.flatMap((message) => {
            if (message.id !== assistantMessage.id) {
              return [message];
            }

            if (message.text.trim()) {
              return [{ ...message, state: 'done' }];
            }

            return [];
          })
        );
        return;
      }

      if (!receivedChunk) {
        try {
          const response = await queryMedicines(nextQuestion, settings, controller.signal);

          if (controller.signal.aborted) {
            return;
          }

          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            text: response.answer,
            medicines: response.medicines,
            state: 'done',
          }));
          return;
        } catch (fallbackError) {
          if (controller.signal.aborted) {
            return;
          }

          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            text: `抱歉，出现了问题：${
              fallbackError instanceof Error ? fallbackError.message : '未知错误'
            }`,
            medicines: [],
            state: 'error',
          }));
          return;
        }
      }

      updateMessage(assistantMessage.id, (message) => ({
        ...message,
        text: `${message.text.trimEnd()}\n\n> 连接中断，以下是已生成的内容。`,
        state: 'error',
      }));
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (initialQuestion?.trim()) {
      void sendQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (medicinesLoading) return;

    if (!loadSettledRef.current) {
      loadSettledRef.current = true;
      prevCountRef.current = medicines.length;
      if (medicines.length === 0) {
        setTransitionPhase('onboarding');
      }
      return;
    }

    const prev = prevCountRef.current;
    prevCountRef.current = medicines.length;

    if (prev === 0 && medicines.length > 0 && transitionPhase === 'onboarding') {
      setTransitionPhase('exiting');
      return;
    }

    if (medicines.length === 0 && transitionPhase === 'ready') {
      setTransitionPhase('onboarding');
    }
  }, [medicinesLoading, medicines.length, transitionPhase]);

  useEffect(() => {
    if (transitionPhase !== 'exiting') return;
    const timer = setTimeout(() => setTransitionPhase('entering'), 550);
    return () => clearTimeout(timer);
  }, [transitionPhase]);

  useEffect(() => {
    if (transitionPhase !== 'entering') return;
    const timer = setTimeout(() => setTransitionPhase('ready'), 1200);
    return () => clearTimeout(timer);
  }, [transitionPhase]);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {hasConversation ? (
        <>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex w-full max-w-[620px] flex-col gap-3 px-4 py-5 md:px-6 md:py-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[90%]">
                    {message.role === 'user' ? (
                      <div className="rounded-[14px] rounded-br-[4px] bg-accent px-4 py-3 text-[13px] leading-7 text-white">
                        {message.text}
                      </div>
                    ) : message.state === 'thinking' && !message.text ? (
                      <ThinkingBubble />
                    ) : (
                      <AssistantBubble message={message} />
                    )}

                    {message.medicines && message.medicines.length > 0 && (
                      <AssistantMedicineResults
                        medicines={message.medicines}
                        expiringDays={settings.expiringDays}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-bg px-4 pb-4 pt-3 md:px-6">
            <div className="mx-auto w-full max-w-[620px]">
              <AiUsageNotice compact />

              <SuggestionChipRow
                chips={suggestionChips}
                onSelect={(chip) => void sendQuestion(chip)}
                className="mb-3 mt-3 flex flex-wrap gap-2"
              />

              <QuestionComposer
                input={input}
                loading={loading}
                variant="compact"
                onInputChange={setInput}
                onSubmit={() => sendQuestion(input)}
              />
            </div>
          </div>
        </>
      ) : transitionPhase === 'onboarding' || transitionPhase === 'exiting' ? (
        <OnboardingView phase={transitionPhase} onAddMedicine={onAddMedicine} />
      ) : (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-8 md:px-6">
          {transitionPhase === 'entering' && <CelebrationParticles />}
          <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />

          <div className="relative z-10 flex w-full max-w-[920px] flex-col items-center">
            <div
              className={`max-w-[680px] text-center text-[32px] font-medium leading-[1.15] text-ink md:text-[54px] ${
                transitionPhase === 'entering' ? 'animate-heroTitleEnter' : ''
              }`}
            >
              今天想查什么？
            </div>

            <div
              className={`mt-10 w-full max-w-[760px] ${
                transitionPhase === 'entering' ? 'animate-searchBarEnter' : ''
              }`}
            >
              <QuestionComposer
                input={input}
                loading={loading}
                variant="empty"
                onInputChange={setInput}
                onSubmit={() => sendQuestion(input)}
              />

              <AiUsageNotice />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
