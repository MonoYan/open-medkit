import type { ChatMessage, QueryResponseStyle } from './types';
import type { Medicine } from './medicine';

export function buildParsePrompt(categories: string[]) {
  return `你是一个药品信息提取助手。用户会描述一个药品，你需要从中提取结构化信息。
请严格按照以下 JSON 格式返回，不要有任何其他文字：
{
  "name": "药品通用名（必填）",
  "name_en": "英文名或通用名（选填，不确定留空字符串）",
  "spec": "规格如 300mg/粒（选填）",
  "quantity": "剩余数量如 20粒（选填）",
  "expires_at": "有效期，格式 YYYY-MM-DD（选填，不确定留空字符串。只有年月时默认为当月最后一天）",
  "category": "分类，优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名（选填）",
  "usage_desc": "用途和适应症（选填）",
  "location": "存放位置（选填）",
  "notes": "备注（选填）"
}

规则：
- name 使用药品通用名或常见商品名，不要包含规格或厂家
- quantity 保留用户原始说法（如"一板""大约20片"），不要转换单位
- expires_at 只有年月时默认为当月最后一天；完全不确定时留空字符串

示例输入：布洛芬缓释胶囊300mg，有效期2027年6月，还剩20粒，放在药箱第一层，退烧止痛
示例输出：
{
  "name": "布洛芬缓释胶囊",
  "name_en": "Ibuprofen SR Capsules",
  "spec": "300mg/粒",
  "quantity": "20粒",
  "expires_at": "2027-06-30",
  "category": "感冒发烧",
  "usage_desc": "退烧、止痛、抗炎",
  "location": "药箱第一层",
  "notes": ""
}

示例输入：创可贴，透气型，大约20片，2026年4月过期
示例输出：
{
  "name": "创可贴",
  "name_en": "Band-Aid",
  "spec": "透气型",
  "quantity": "约20片",
  "expires_at": "2026-04-30",
  "category": "外伤处理",
  "usage_desc": "用于小伤口、擦伤的止血保护",
  "location": "",
  "notes": ""
}`;
}

export function buildBatchParsePrompt(categories: string[], itemCount: number) {
  return `你是一个药品信息提取助手。用户将描述 ${itemCount} 个药品（每行一个），请返回一个 JSON 对象，其中 "medicines" 字段是一个数组，每个元素对应一行药品。
严格按照以下格式返回，不要有任何其他文字：
{
  "medicines": [
    {
      "name": "药品通用名（必填）",
      "name_en": "英文名或通用名（选填，不确定留空字符串）",
      "spec": "规格如 300mg/粒（选填）",
      "quantity": "剩余数量如 20粒（选填）",
      "expires_at": "有效期，格式 YYYY-MM-DD（选填，不确定留空字符串。只有年月时默认为当月最后一天）",
      "category": "分类，优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名（选填）",
      "usage_desc": "用途和适应症（选填）",
      "location": "存放位置（选填）",
      "notes": "备注（选填）"
    }
  ]
}
请确保 medicines 数组长度与输入行数一致（${itemCount} 个元素）。`;
}

export function buildDraftCompletionPrompt(categories: string[]) {
  return `你是一个家庭药箱录入助手。用户已经填写了一份药品草稿，请你在已有信息基础上尽量补全和规范化以下字段：name、name_en、spec、category、usage_desc。

请严格返回一个 JSON 对象，且只能包含以下字段：
{
  "name": "药品名称，尽量使用常见通用名或完整名称；不确定留空字符串",
  "name_en": "英文名或通用英文名；不确定留空字符串",
  "spec": "规格，如 300mg/粒；不确定留空字符串",
  "category": "分类，优先从以下已有分类中选择：${categories.join('、')}；如果都不匹配，再给出合理新分类；不确定留空字符串",
  "usage_desc": "用途和适应症，使用中文简洁描述；不确定留空字符串"
}

规则：
1. 仅根据用户已提供的信息和常见药品知识进行谨慎补全
2. 不确定时必须返回空字符串，不要猜测批号、数量、有效期、存放位置等未要求字段
3. 如果用户已有填写内容比较明确，可以在保持原意的前提下补全或规范化
4. 不要返回 Markdown，不要返回解释说明，不要返回额外字段`;
}

export function buildImageParseMessages(categories: string[], imageDataUrl: string): ChatMessage[] {
  return [
    { role: 'system', content: buildParsePrompt(categories) },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        {
          type: 'text',
          text: `请从这张药品包装照片中提取药品信息。
注意：
- 优先读取包装盒正面的药品名称和规格
- 有效期通常印在包装侧面或底部，格式可能是"有效期至YYYY.MM"或"EXP YYYY/MM"
- 如果图片模糊或信息不完整，只提取能确认的字段，其他留空字符串
- 不要猜测图片中看不到的信息`,
        },
      ],
    },
  ];
}

export function buildQueryPrompt(
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const styleInstruction =
    responseStyle === 'detailed'
      ? '2. 正文可以使用 4 到 6 个短要点，允许补充简短判断依据、注意事项和下一步建议\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 保持信息充分但克制，优先给最相关的药品和关键理由'
      : '2. 控制篇幅，正文尽量保持在 2 到 4 个短要点内\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 只给结论和最关键的信息；位置、数量、详细说明会由界面单独展示，除非它们对回答关键';

  return `你是家庭药箱助手。下面是用户药箱中所有药品的完整数据（JSON 数组）。

今天的日期是：${todayStr}（YYYY-MM-DD格式）
过期判断：expires_at < '${todayStr}' 为已过期，'${todayStr}' <= expires_at <= '${in30daysStr}' 为即将过期（${expiringDays}天内）。
回答风格：${responseStyle === 'detailed' ? '详细' : '简洁'}

请根据用户的问题和药品数据，给出简洁、有用的回答。
规则：
1. 回答使用中文 Markdown，优先使用短标题、列表和强调，不要输出 JSON
${styleInstruction}
5. 如果命中多个药品，优先提最相关的 1 到 3 个，不要把所有细节全部展开
6. 如果查询结果为空或没有匹配药品，明确告知药箱中没有相关药品
7. 如果回答涉及的药品中有已过期的，一定要提醒用户不要继续使用
8. 只能基于提供的数据回答，不要编造药品或功效
9. 不要输出就医建议、免责声明、用药禁忌等超出药箱数据范围的医学建议板块
10. 不要告诉用户"哪些药不适合"某症状，只说药箱里有什么可能相关的
11. 在回答中尽量提及相关药品的完整名称，以便系统自动识别
12. 最后一行必须单独输出机器标记，格式固定为：[[MEDKIT_IDS:1,3,5]]
13. 如果没有匹配药品，最后一行输出：[[MEDKIT_IDS:]]
14. 不要在正文解释这个机器标记`;
}

export function buildQueryMessages(
  question: string,
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  return [
    {
      role: 'system' as const,
      content: buildQueryPrompt(todayStr, in30daysStr, expiringDays, responseStyle),
    },
    {
      role: 'user' as const,
      content: `药品数据：${JSON.stringify(medicines)}\n\n用户问题：${question}`,
    },
  ];
}
