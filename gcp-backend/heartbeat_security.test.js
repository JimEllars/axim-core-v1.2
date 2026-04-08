import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from './index.js';
import apiService from './apiService.js';

vi.mock('./apiService.js', () => {
    return {
        default: {
            initialize: vi.fn().mockResolvedValue(),
            verifyApiKey: vi.fn(),
            sendDeviceHeartbeat: vi.fn(),
            getActiveAutomations: vi.fn().mockResolvedValue([]),
        }
    }
});

// Mock scheduler to prevent it from starting during tests
vi.mock('./scheduler.js', () => ({
    default: {
        initScheduler: vi.fn().mockResolvedValue(),
        refreshScheduler: vi.fn().mockResolvedValue(),
    }
}));

describe('Heartbeat Endpoint Security', () => {
    const userId = 'user-123';
    const apiKey = 'valid-api-key';
    const deviceId = 'device-1';

    beforeEach(() => {
        vi.clearAllMocks();
        apiService.initialize.mockResolvedValue();
        apiService.verifyApiKey.mockResolvedValue(userId);
    });

    it('should use authenticated user ID for heartbeat even if not in body', async () => {
        const mockDevice = { id: deviceId, status: 'online' };
        apiService.sendDeviceHeartbeat.mockResolvedValue(mockDevice);

        const res = await request(app)
            .post(`/devices/${deviceId}/heartbeat`)
            .set('Authorization', `Bearer ${apiKey}`)
            .send({ system_info: { cpu: '10%' } });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockDevice);
        expect(apiService.sendDeviceHeartbeat).toHaveBeenCalledWith(deviceId, { cpu: '10%' }, userId);
    });

    it('should ignore userId in body and use authenticated user ID', async () => {
        const mockDevice = { id: deviceId, status: 'online' };
        apiService.sendDeviceHeartbeat.mockResolvedValue(mockDevice);

        const res = await request(app)
            .post(`/devices/${deviceId}/heartbeat`)
            .set('Authorization', `Bearer ${apiKey}`)
            .send({ userId: 'malicious-user', system_info: {} });

        expect(res.status).toBe(200);
        // Should STILL be called with our authenticated userId, not 'malicious-user'
        expect(apiService.sendDeviceHeartbeat).toHaveBeenCalledWith(deviceId, {}, userId);
    });

    it('should return 500 when device does not belong to user (service throws)', async () => {
        apiService.sendDeviceHeartbeat.mockRejectedValue(new Error('Device not found. Please register first.'));

        const res = await request(app)
            .post(`/devices/${deviceId}/heartbeat`)
            .set('Authorization', `Bearer ${apiKey}`)
            .send({ system_info: {} });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Device not found. Please register first.');
    });
});
