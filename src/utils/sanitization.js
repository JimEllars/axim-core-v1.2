export function sanitizePayload(payload) {
    if (!payload) return payload;

    const maskedValue = '[REDACTED]';
    const sensitiveKeys = ['password', 'token', 'secret', 'api_key', 'email', 'phone', 'street_address', 'name'];

    if (typeof payload === 'object') {
        if (Array.isArray(payload)) {
            return payload.map(item => sanitizePayload(item));
        }

        const sanitized = { ...payload };
        for (const key in sanitized) {
            if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
                if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                    sanitized[key] = maskedValue;
                } else if (typeof sanitized[key] === 'object') {
                    sanitized[key] = sanitizePayload(sanitized[key]);
                }
            }
        }
        return sanitized;
    }

    return payload;
}
