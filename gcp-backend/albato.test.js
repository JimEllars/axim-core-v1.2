import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from './index.js';
import apiService from './apiService.js';

// Mock apiService before importing app (though with ESM, hoisting happens,
// but vi.mock needs to be at top level)
vi.mock('./apiService.js', () => {
    return {
        default: {
            initialize: vi.fn().mockResolvedValue(),
            verifyApiKey: vi.fn(),
            ingestDatasetEvents: vi.fn(),
    getActiveAutomations: vi.fn().mockResolvedValue([]),
            queryDatasetEvents: vi.fn(),
            updateAssetStatus: vi.fn(),
            createAnnotation: vi.fn(),
            controlInfrastructure: vi.fn(),
            // Mock other methods called by other routes if needed,
            // but for unit testing Albato routes, this should suffice
            // as long as app import doesn't crash.
            // However, app has other routes that might use other methods if triggered.
            // Since we only test Albato routes, others won't be called.
            // But apiService is a class instance in real code.
            // vi.mock replaces the module export.
        }
    }
});

describe('Albato Integration API', () => {
    const validApiKey = 'valid-api-key';
    const invalidApiKey = 'invalid-api-key';
    const userId = 'user-123';

    beforeEach(() => {
        vi.clearAllMocks();
        apiService.initialize.mockResolvedValue();
    });

    // Test Authentication Middleware
    it('should reject requests without API Key', async () => {
        const res = await request(app).post('/api/v1/datasets/test/ingest').send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Missing or invalid Authorization header/);
    });

    it('should reject requests with invalid API Key', async () => {
        apiService.verifyApiKey.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/v1/datasets/test/ingest')
            .set('Authorization', `Bearer ${invalidApiKey}`)
            .send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid API Key');
    });

    // Test Ingest Endpoint
    it('should ingest events successfully', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        apiService.ingestDatasetEvents.mockResolvedValue({ success: true, count: 1, ids: ['event-1'] });

        const payload = { events: [{ id: 1, val: 'test' }] };
        const res = await request(app)
            .post('/api/v1/datasets/test-dataset/ingest')
            .set('Authorization', `Bearer ${validApiKey}`)
            .send(payload);

        expect(res.status).toBe(201);
        expect(apiService.ingestDatasetEvents).toHaveBeenCalledWith('test-dataset', payload.events, userId);
        expect(res.body).toEqual({ success: true, count: 1, ids: ['event-1'] });
    });

    it('should handle array payload for ingest', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        apiService.ingestDatasetEvents.mockResolvedValue({ success: true, count: 2 });

        const payload = [{ id: 1 }, { id: 2 }];
        const res = await request(app)
            .post('/api/v1/datasets/test-dataset/ingest')
            .set('Authorization', `Bearer ${validApiKey}`)
            .send(payload);

        expect(res.status).toBe(201);
        expect(apiService.ingestDatasetEvents).toHaveBeenCalledWith('test-dataset', payload, userId);
    });

    // Test Query Endpoint
    it('should query events successfully', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        const mockEvents = [{ id: 1, type: 'test' }];
        apiService.queryDatasetEvents.mockResolvedValue(mockEvents);

        const res = await request(app)
            .get('/api/v1/datasets/test-dataset/query?limit=10')
            .set('Authorization', `Bearer ${validApiKey}`);

        expect(res.status).toBe(200);
        expect(apiService.queryDatasetEvents).toHaveBeenCalledWith('test-dataset', expect.objectContaining({ limit: 10 }), userId);
        expect(res.body).toEqual(mockEvents);
    });

    // Test Update Asset
    it('should update asset status', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        const mockAsset = { id: 'dev-1', status: 'online' };
        apiService.updateAssetStatus.mockResolvedValue(mockAsset);

        const res = await request(app)
            .patch('/api/v1/assets/dev-1')
            .set('Authorization', `Bearer ${validApiKey}`)
            .send({ status: 'online' });

        expect(res.status).toBe(200);
        expect(apiService.updateAssetStatus).toHaveBeenCalledWith('dev-1', { status: 'online' }, userId);
        expect(res.body).toEqual(mockAsset);
    });

    // Test Create Annotation
    it('should create annotation', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        const mockAnnotation = { id: 'ann-1', type: 'annotation' };
        apiService.createAnnotation.mockResolvedValue(mockAnnotation);

        const res = await request(app)
            .post('/api/v1/annotations')
            .set('Authorization', `Bearer ${validApiKey}`)
            .send({ text: 'Note' });

        expect(res.status).toBe(201);
        expect(apiService.createAnnotation).toHaveBeenCalledWith({ text: 'Note' }, userId);
        expect(res.body).toEqual(mockAnnotation);
    });

    // Test Control Infrastructure
    it('should control infrastructure', async () => {
        apiService.verifyApiKey.mockResolvedValue(userId);
        const mockResult = { id: 'evt-1', type: 'infrastructure_control' };
        apiService.controlInfrastructure.mockResolvedValue(mockResult);

        const res = await request(app)
            .put('/api/v1/control/unit-1')
            .set('Authorization', `Bearer ${validApiKey}`)
            .send({ command: 'start' });

        expect(res.status).toBe(200);
        expect(apiService.controlInfrastructure).toHaveBeenCalledWith('unit-1', 'start', userId);
        expect(res.body).toEqual(mockResult);
    });
});
