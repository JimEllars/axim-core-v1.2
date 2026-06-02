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


export function applyCredentialMasking(envConfig) {
    if (!envConfig || typeof envConfig !== 'object') return envConfig;

    const maskedConfig = { ...envConfig };

    if (maskedConfig.STRIPE_SECRET_KEY) {
        maskedConfig.STRIPE_SECRET_KEY = "sk_test_mock_axim_cowork_string";
    }

    if (maskedConfig.SUPABASE_SERVICE_ROLE_KEY) {
        maskedConfig.SUPABASE_SERVICE_ROLE_KEY = "sb_mock_service_role";
    }

    return maskedConfig;
}
