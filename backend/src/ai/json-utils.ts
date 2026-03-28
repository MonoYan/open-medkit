export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function tryParseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function extractCodeFenceJson(text: string) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match?.[1]?.trim() || null;
}

export function extractFirstJsonBlock(text: string) {
  let start = -1;
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === '{' || char === '[') {
        start = index;
        stack.push(char === '{' ? '}' : ']');
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char === '}' || char === ']') {
      if (stack[stack.length - 1] !== char) {
        return null;
      }

      stack.pop();

      if (stack.length === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

export function parseAiJsonResponse<T>(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed, extractCodeFenceJson(trimmed), extractFirstJsonBlock(trimmed)].filter(
    (candidate): candidate is string => Boolean(candidate)
  );

  for (const candidate of candidates) {
    const parsed = tryParseJson<T>(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}
