import type { Context } from 'hono';

import type { AiEnv } from '../middleware/apiKey';
import { callAiJson } from './client';
import { isRecord } from './json-utils';
import { getDynamicCategories, normalizeMedicineDraftPayload } from './medicine';
import { buildDraftCompletionPrompt, buildImageParseMessages, buildParsePrompt } from './prompts';

export async function parseMedicineText(
  c: Context<AiEnv>,
  text: string,
) {
  const categories = await getDynamicCategories();
  const { parsed, raw } = await callAiJson<Record<string, string> | null>(c, [
    { role: 'system', content: buildParsePrompt(categories) },
    { role: 'user', content: text },
  ]);

  if (!isRecord(parsed)) {
    return { error: 'AI returned invalid format', raw };
  }

  return {
    data: normalizeMedicineDraftPayload(parsed),
  };
}

export async function parseMedicineImage(c: Context<AiEnv>, imageDataUrl: string) {
  const categories = await getDynamicCategories();
  const messages = buildImageParseMessages(categories, imageDataUrl);
  const { parsed, raw } = await callAiJson<Record<string, string> | null>(c, messages);

  if (!isRecord(parsed)) {
    return { error: 'AI returned invalid format', raw };
  }

  return { data: normalizeMedicineDraftPayload(parsed) };
}

export async function completeMedicineDraft(
  c: Context<AiEnv>,
  draft: Record<string, unknown>,
  sourceText: string,
) {
  const categories = await getDynamicCategories();
  const { parsed, raw } = await callAiJson<Record<string, string> | null>(c, [
    { role: 'system', content: buildDraftCompletionPrompt(categories) },
    {
      role: 'user',
      content: `原始描述：${sourceText || '（无）'}\n\n当前药品草稿：${JSON.stringify(draft, null, 2)}`,
    },
  ]);

  if (!isRecord(parsed)) {
    return { error: 'AI returned invalid format', raw };
  }

  return {
    data: {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      name_en: typeof parsed.name_en === 'string' ? parsed.name_en : '',
      spec: typeof parsed.spec === 'string' ? parsed.spec : '',
      category: typeof parsed.category === 'string' ? parsed.category : '',
      usage_desc: typeof parsed.usage_desc === 'string' ? parsed.usage_desc : '',
    },
  };
}
