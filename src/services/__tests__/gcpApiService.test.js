import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import logger from '../logging';

// Mock dependencies
const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const mockCreate = vi.fn(() => mockAxiosInstance);

vi.mock('axios', () => ({
  default: {
    create: mockCreate,
  },
}));

vi.mock('../logging', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GcpApiService', () => {
  let gcpApiService;
  let DatabaseError;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock config dynamically to ensure it persists across resets
vi.mock('../../config', () => ({
      default: {
        apiBaseUrl: 'http://localhost:8080',
        dataSource: 'gcp'
      },
    }));

    // Default successful health check
    mockAxiosInstance.get.mockImplementation((url) => {
      if (url === '/healthz') return Promise.resolve({ status: 200 });
      return Promise.resolve({ data: {} });
    });

    // Import modules dynamically to ensure they share the same context/cache after reset
    gcpApiService = (await import('../gcpApiService')).default;
    const errors = await import('../onyxAI/errors');
    DatabaseError = errors.DatabaseError;

    await gcpApiService.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully when backend is reachable', async () => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'http://localhost:8080',
      }));
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/healthz');
      expect(logger.info).toHaveBeenCalledWith('GcpApiService initialized and connected to backend.');
    });

    it('should handle initialization failure gracefully', async () => {
      mockCreate.mockClear();
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network Error'));

      // Re-initialize (creates new client)
      await gcpApiService.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize GcpApiService:', expect.any(Error));
    });
  });

  describe('Proxy Behavior', () => {
    it('should throw an error for unimplemented methods to trigger fallback', async () => {
      await expect(gcpApiService.someRandomMethod('arg'))
        .rejects.toThrow('Method someRandomMethod not implemented in GcpApiService');
    });

    it('should call implemented methods correctly', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      await expect(gcpApiService.listDevices('user123')).resolves.toEqual([]);
    });
  });

  describe('Contacts API', () => {
    const userId = 'user-123';
    const contact = { name: 'John Doe', email: 'john@example.com', source: 'web' };

    it('addContact should post data and return result', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: contact });
      const result = await gcpApiService.addContact('John Doe', 'john@example.com', 'web', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/contacts', {
        name: 'John Doe',
        email: 'john@example.com',
        source: 'web',
        userId
      });
      expect(result).toEqual(contact);
    });

    it('addContact should throw DatabaseError on failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: { data: { error: 'Duplicate' } }
      });

      // Check against the dynamically imported Error class
      await expect(gcpApiService.addContact('John', 'john@a.com', 'web', userId))
        .rejects.toThrow(DatabaseError);
    });

    it('listAllContacts should get data with userId param', async () => {
      const contacts = [contact];
      mockAxiosInstance.get.mockResolvedValueOnce({ data: contacts });
      const result = await gcpApiService.listAllContacts({}, userId);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/contacts', { params: { userId } });
      expect(result).toEqual(contacts);
    });
  });

  describe('Project Management API', () => {
    const userId = 'user-123';
    const project = { id: 1, name: 'Project A' };

    it('createProject should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: project });
      const result = await gcpApiService.createProject('Project A', 'Desc', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/projects', {
        name: 'Project A',
        description: 'Desc',
        userId
      });
      expect(result).toEqual(project);
    });

    it('listProjects should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [project] });
      const result = await gcpApiService.listProjects(userId);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/projects', { params: { userId } });
      expect(result).toEqual([project]);
    });
  });

  describe('AI Interaction Logging', () => {
    it('logAIInteraction should post data and not throw on error', async () => {
      // Success case
      mockAxiosInstance.post.mockResolvedValueOnce({});
      await gcpApiService.logAIInteraction('cmd', 'res', 100, 'success', 'u1', 'c1', 'direct', 'gemini', 'pro');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/interactions', expect.any(Object));

      // Error case - logs error but doesn't throw
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Log failed'));
      await expect(gcpApiService.logAIInteraction('cmd', 'res', 100, 'success', 'u1', 'c1', 'direct', 'gemini', 'pro'))
        .resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith('GCP logAIInteraction failed:', expect.any(Error));
    });
  });

  describe('External Service Proxies', () => {
    const userId = 'user-123';

    it('initiateTranscription should call backend endpoint', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { status: 'queued' } });
      const result = await gcpApiService.initiateTranscription('source_url', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/integrations/transcribe', { source: 'source_url', userId });
      expect(result).toEqual({ status: 'queued' });
    });

    it('invokeAximService should call backend endpoint', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.invokeAximService('svc', 'ep', {}, userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/integrations/invoke', { serviceName: 'svc', endpoint: 'ep', payload: {}, userId });
      expect(result).toEqual({ success: true });
    });
  });

  describe('Device Management API', () => {
      const userId = 'user-123';
      const deviceId = 'dev-1';

      it('registerDevice should post data', async () => {
          mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: deviceId } });
          await gcpApiService.registerDevice(deviceId, 'My Device', {}, userId);
          expect(mockAxiosInstance.post).toHaveBeenCalledWith('/devices', {
              id: deviceId,
              device_name: 'My Device',
              system_info: {},
              userId
          });
      });

      it('listDevices should get data', async () => {
          mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
          await gcpApiService.listDevices(userId);
          expect(mockAxiosInstance.get).toHaveBeenCalledWith('/devices', { params: { userId } });
      });

      it('deleteDevice should send delete request', async () => {
          mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
          await gcpApiService.deleteDevice(deviceId, userId);
          expect(mockAxiosInstance.delete).toHaveBeenCalledWith(`/devices/${deviceId}`, { data: { userId } });
      });
  });
});
