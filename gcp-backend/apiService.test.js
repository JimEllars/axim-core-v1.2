import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiService from './apiService.js';

// Mock pg
const mQuery = vi.fn();
const mPool = {
  connect: vi.fn(),
  query: mQuery,
  on: vi.fn(),
};

// We need to mock 'pg' before it's used in apiService
vi.mock('pg', () => {
  return { Pool: vi.fn(() => mPool) };
});

// Mock other dependencies
vi.mock('@google-cloud/secret-manager');
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    on: vi.fn(),
  })),
}));
vi.mock('@google-cloud/pubsub');
// Mock bcryptjs correctly
vi.mock('bcryptjs', () => ({
  default: {
    genSalt: vi.fn(() => 'salt'),
    hash: vi.fn(() => 'hashed_secret'),
    compare: vi.fn(),
  },
}));

describe('ApiService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DB_USER = 'test';
    process.env.DB_PASSWORD = 'test';
    // Initialize to set up this.db with our mock
    // Note: apiService is a singleton instance. If it was already initialized,
    // re-calling initialize might re-create the pool or error.
    // Given the implementation, it creates new pool and overwrites this.db.
    // So mocking pg works if we do it before import, but we import first.
    // However, vitest hoists mocks.
    // Let's ensure this.db is our mock.
    apiService.db = mPool;
  });

  describe('Satellite Protocol', () => {
    it('should register a satellite app', async () => {
      mQuery.mockResolvedValueOnce({ rows: [{ app_id: 'test-app' }] });

      const result = await apiService.registerSatelliteApp('test-app', 'secret', 'Test App');

      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO satellite_apps');
      expect(params).toEqual(['test-app', 'hashed_secret', 'Test App']);
      expect(result).toEqual({ app_id: 'test-app' });
    });

    it('should verify valid satellite app credentials', async () => {
      mQuery.mockResolvedValueOnce({ rows: [{ secret_hash: 'hashed_secret' }] });
      const bcrypt = await import('bcryptjs');
      bcrypt.default.compare.mockResolvedValue(true);

      const isValid = await apiService.verifySatelliteApp('test-app', 'secret');

      expect(isValid).toBe(true);
      expect(mQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT secret_hash'), ['test-app']);
    });

    it('should reject invalid satellite app credentials', async () => {
      mQuery.mockResolvedValueOnce({ rows: [{ secret_hash: 'hashed_secret' }] });
      const bcrypt = await import('bcryptjs');
      bcrypt.default.compare.mockResolvedValue(false);

      const isValid = await apiService.verifySatelliteApp('test-app', 'wrong-secret');

      expect(isValid).toBe(false);
    });
  });

  describe('listAllContacts', () => {
    it('should list contacts with default options', async () => {
      mQuery.mockResolvedValueOnce({ rows: [] });
      await apiService.listAllContacts('user-123');

      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(params).toEqual(['user-123']);
    });

    it('should support sorting by name ASC', async () => {
      mQuery.mockResolvedValueOnce({ rows: [] });
      await apiService.listAllContacts('user-123', { sortBy: 'name', sortOrder: 'ASC' });

      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY name ASC');
      expect(params).toEqual(['user-123']);
    });

    it('should support filtering by source', async () => {
      mQuery.mockResolvedValueOnce({ rows: [] });
      await apiService.listAllContacts('user-123', { filter: { source: 'web' } });

      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mQuery.mock.calls[0];
      expect(sql).toContain('source = $');
      expect(params[0]).toBe('user-123');
      expect(params).toContain('web');
    });

    it('should ignore invalid sort columns', async () => {
      mQuery.mockResolvedValueOnce({ rows: [] });
      await apiService.listAllContacts('user-123', { sortBy: 'invalid_column', sortOrder: 'ASC' });

      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql] = mQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at'); // Default
      expect(sql).not.toContain('invalid_column');
    });
  });

  describe('ingestDatasetEvents', () => {
    it('should ingest events successfully', async () => {
      // Mock db query
      const mockResult = { rows: [{ id: 'evt-1' }] };
      mQuery.mockResolvedValueOnce(mockResult);

      const events = [{ id: 1 }, { id: 2 }];
      const result = await apiService.ingestDatasetEvents('test-dataset', events, 'user-123');

      expect(result).toEqual({ success: true, count: 1, ids: ['evt-1'] });
      expect(mQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mQuery.mock.calls[0];

      expect(sql).toContain('INSERT INTO events_ax2024');
      // ($1, 'albato', $2, $3), ($4, 'albato', $5, $6)
      expect(sql).toContain('($1, \'albato\', $2, $3)');
      expect(sql).toContain('($4, \'albato\', $5, $6)');

      expect(params.length).toBe(6);
      expect(params[0]).toBe('test-dataset');
      expect(params[2]).toBe('user-123');
    });

    it('should handle single object as array', async () => {
       const mockResult = { rows: [{ id: 'evt-1' }] };
       mQuery.mockResolvedValueOnce(mockResult);

       const event = { id: 1 };
       const result = await apiService.ingestDatasetEvents('test-dataset', event, 'user-123');

       expect(result.success).toBe(true);
       expect(mQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should fetch all metrics concurrently and return them', async () => {
      // Mock 6 responses for the 6 concurrent queries
      mQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // totalContacts
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })   // newToday
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })  // activeEvents
        .mockResolvedValueOnce({ rows: [{ count: '200' }] }) // aiInteractions
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })  // workflowsTriggered
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }); // activeUsers

      const metrics = await apiService.getDashboardMetrics();

      expect(mQuery).toHaveBeenCalledTimes(6);
      expect(metrics).toEqual({
        totalContacts: 100,
        newToday: 5,
        activeEvents: 50,
        aiInteractions: 200,
        contactChange: 0,
        workflowsTriggered: 10,
        activeUsers: 20
      });
    });

    it('should throw error if any query fails', async () => {
      mQuery.mockRejectedValueOnce(new Error('DB Error'));

      await expect(apiService.getDashboardMetrics()).rejects.toThrow('Failed to fetch metrics: DB Error');
    });
  });
});
