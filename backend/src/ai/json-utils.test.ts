import { describe, expect, it } from 'vitest';

import {
  extractCodeFenceJson,
  extractFirstJsonBlock,
  isRecord,
  parseAiJsonResponse,
  tryParseJson,
} from './json-utils';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for non-objects', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });
});

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson('[1,2,3]')).toEqual([1, 2, 3]);
    expect(tryParseJson('"hello"')).toBe('hello');
  });

  it('returns null for invalid JSON', () => {
    expect(tryParseJson('')).toBe(null);
    expect(tryParseJson('not json')).toBe(null);
    expect(tryParseJson('{broken')).toBe(null);
  });
});

describe('extractCodeFenceJson', () => {
  it('extracts JSON from code fences', () => {
    const input = '```json\n{"name":"test"}\n```';
    expect(extractCodeFenceJson(input)).toBe('{"name":"test"}');
  });

  it('extracts from fences without language tag', () => {
    const input = '```\n{"name":"test"}\n```';
    expect(extractCodeFenceJson(input)).toBe('{"name":"test"}');
  });

  it('handles multiline JSON inside fences', () => {
    const input = '```json\n{\n  "name": "test",\n  "value": 42\n}\n```';
    const result = extractCodeFenceJson(input);
    expect(JSON.parse(result!)).toEqual({ name: 'test', value: 42 });
  });

  it('returns null when no code fence found', () => {
    expect(extractCodeFenceJson('just plain text')).toBe(null);
    expect(extractCodeFenceJson('{"name":"test"}')).toBe(null);
  });
});

describe('extractFirstJsonBlock', () => {
  it('extracts a JSON object', () => {
    const result = extractFirstJsonBlock('some text {"a":1} more text');
    expect(result).toBe('{"a":1}');
  });

  it('extracts a JSON array', () => {
    const result = extractFirstJsonBlock('prefix [1,2,3] suffix');
    expect(result).toBe('[1,2,3]');
  });

  it('handles nested braces', () => {
    const input = '{"outer":{"inner":true}}';
    expect(extractFirstJsonBlock(input)).toBe('{"outer":{"inner":true}}');
  });

  it('handles strings with escaped characters', () => {
    const input = '{"text":"hello \\"world\\""}';
    expect(extractFirstJsonBlock(input)).toBe('{"text":"hello \\"world\\""}');
  });

  it('handles strings containing braces', () => {
    const input = '{"text":"a{b}c"}';
    expect(extractFirstJsonBlock(input)).toBe('{"text":"a{b}c"}');
  });

  it('returns null for unbalanced braces', () => {
    expect(extractFirstJsonBlock('{unclosed')).toBe(null);
    expect(extractFirstJsonBlock('no json here')).toBe(null);
  });

  it('returns null for mismatched brackets', () => {
    expect(extractFirstJsonBlock('{]')).toBe(null);
    expect(extractFirstJsonBlock('[}')).toBe(null);
  });

  it('returns null for empty input', () => {
    expect(extractFirstJsonBlock('')).toBe(null);
  });
});

describe('parseAiJsonResponse', () => {
  it('parses raw JSON directly', () => {
    expect(parseAiJsonResponse('{"name":"test"}')).toEqual({ name: 'test' });
  });

  it('parses JSON from code fences', () => {
    const input = 'Here is the result:\n```json\n{"name":"test"}\n```';
    expect(parseAiJsonResponse(input)).toEqual({ name: 'test' });
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'The medicine is: {"name":"布洛芬"} as requested.';
    expect(parseAiJsonResponse(input)).toEqual({ name: '布洛芬' });
  });

  it('returns null for empty/whitespace input', () => {
    expect(parseAiJsonResponse('')).toBe(null);
    expect(parseAiJsonResponse('   ')).toBe(null);
  });

  it('returns null for completely unparseable text', () => {
    expect(parseAiJsonResponse('no json anywhere')).toBe(null);
  });

  it('parses arrays', () => {
    expect(parseAiJsonResponse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('handles complex nested structures', () => {
    const input = '{"medicines":[{"name":"A"},{"name":"B"}]}';
    const result = parseAiJsonResponse(input);
    expect(result).toEqual({ medicines: [{ name: 'A' }, { name: 'B' }] });
  });
});
