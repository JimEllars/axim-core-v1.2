const SECRET_PATTERNS = [
  [/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]'],
  [/(?:sk-(?:live-|test-|ant-)?|secret_|ghp_|github_pat_|xox[baprs]-|npm_|AIza)[a-zA-Z0-9_-]{16,}/gi, '[REDACTED_SECRET]'],
  [/(?:postgres(?:ql)?|mysql|redis):\/\/[^\s@/]+:[^\s@/]+@[^\s/'"]+/gi, '[REDACTED_CONNECTION_STRING]'],
  [/Bearer\s+[a-zA-Z0-9._~+/-]{12,}/gi, 'Bearer [REDACTED_TOKEN]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]'],
  [/(?<!\w)(?:\+?\d[\s().-]*){10,15}(?!\w)/g, '[REDACTED_PHONE]']
];

const SENSITIVE_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role|password|secret|authorization|private[_-]?key)/i;

function sanitizeValue(value: any, seen: WeakSet<any>): any {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.reduce((str, [pattern, rep]) => str.replace(pattern as RegExp, rep as string), value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED_CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, seen));

  const sanitized: any = {};
  for (const [k, v] of Object.entries(value)) {
    sanitized[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : sanitizeValue(v, seen);
  }
  return sanitized;
}

export function sanitizeEgressPayload(payload: any): any {
  if (payload === null || payload === undefined) return payload;
  try {
    return sanitizeValue(payload, new WeakSet());
  } catch {
    return '[REDACTED_UNSERIALIZABLE]';
  }
}
