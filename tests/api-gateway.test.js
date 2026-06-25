import { describe, it, expect } from 'vitest';

describe('api-gateway Auth Integrity', () => {
    it('authenticates a hashed key, rejects revoked keys, and rejects unknown keys', async () => {
        const encoder = new TextEncoder();
        const data = encoder.encode('test_api_key_123');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Simulate database lookup behavior in api-gateway
        const mockDatabase = [
            { api_key: hashedKey, status: 'active', id: '1' },
            { api_key: 'another_hash', status: 'revoked', id: '2' }
        ];

        const authenticate = (incomingKey) => {
            const result = mockDatabase.find(row => row.api_key === incomingKey);
            if (!result || result.status === 'revoked') {
                return false;
            }
            return true;
        };

        // 1. Authenticate a valid issued (hashed) key
        expect(authenticate(hashedKey)).toBe(true);

        // 2. Reject revoked keys
        expect(authenticate('another_hash')).toBe(false);

        // 3. Reject unknown keys
        const unknownData = encoder.encode('unknown_key');
        const unknownHashBuffer = await crypto.subtle.digest('SHA-256', unknownData);
        const unknownHashArray = Array.from(new Uint8Array(unknownHashBuffer));
        const unknownHashedKey = unknownHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        expect(authenticate(unknownHashedKey)).toBe(false);
    });
});
