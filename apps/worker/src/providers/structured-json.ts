function completeJsonObjectEnd(source: string, start: number): number {
  if (source[start] !== '{') return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/**
 * Accepts exactly one raw object or exactly one object wrapped by one JSON fence.
 * Any prose, truncation, duplicate object, array, or trailing token fails closed.
 */
export function parseStrictStructuredJson(raw: string): unknown {
  const trimmed = String(raw || '').replace(/^\uFEFF/u, '').trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const source = (fence ? fence[1] : trimmed).trim();
  if (!source.startsWith('{')) throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  const end = completeJsonObjectEnd(source, 0);
  if (end < 0 || end !== source.length - 1) throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  return parsed;
}
