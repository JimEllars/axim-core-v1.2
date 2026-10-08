export function sanitizeEgressPayload(payload: any): any {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    let sanitized = payload;
    // JWTs
    sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
    // API Keys
    sanitized = sanitized.replace(/(?:sk-(?:live-|test-|ant-)?|secret_|ghp_|github_pat_|xox[baprs]-|npm_|AIza)[a-zA-Z0-9_-]{16,}/gi, '[REDACTED_SECRET]');
    // DB Connection strings
    sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|redis):\/\/[^\s@/]+:[^\s@/]+@[^\s/'"]+/gi, '[REDACTED_CONNECTION_STRING]');
    // Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._~+/-]{12,}/gi, 'Bearer [REDACTED_TOKEN]');
    // Emails
    sanitized = sanitized.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
    // Phone numbers
    sanitized = sanitized.replace(/(?<!\w)(?:\+?\d[\s().-]*){10,15}(?!\w)/g, '[REDACTED_PHONE]');
    // Sensitive keys
    sanitized = sanitized.replace(/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role|password|secret|authorization|private[_-]?key)/i, '[REDACTED]');
    return sanitized;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeEgressPayload(item));
  }

  if (typeof payload === 'object') {
    const sanitizedObj: any = {};
    for (const key in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        // Redact values if the key itself indicates a sensitive field?
        // The spec says "recursive redaction... on all outbound tool responses".
        // Applying string redaction to values.
        sanitizedObj[key] = sanitizeEgressPayload(payload[key]);
      }
    }
    return sanitizedObj;
  }

  return payload;
}
