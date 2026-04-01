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

  describe('More Contacts API', () => {
    const userId = 'user-123';

    it('searchMemory should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: ['mem1'] });
      const result = await gcpApiService.searchMemory([0.1, 0.2], 5, userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/interactions/memory', {
        embedding: [0.1, 0.2], limit: 5, userId
      });
      expect(result).toEqual(['mem1']);
    });

    it('searchMemory should return empty array on failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('fail'));
      const result = await gcpApiService.searchMemory([0.1], 5, userId);
      expect(result).toEqual([]);
    });

    it('deleteContact should require userId and delete data', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.deleteContact('test@example.com', userId);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/contacts/email/test@example.com', { data: { userId } });
      expect(result).toEqual({ success: true });
    });

    it('deleteContact should throw if no userId', async () => {
      await expect(gcpApiService.deleteContact('test@example.com', null))
        .rejects.toThrow('User ID required for deleteContact');
    });

    it('getContacts should search contacts', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
      const result = await gcpApiService.getContacts('test', userId);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/contacts/search', { params: { q: 'test', userId } });
      expect(result).toEqual([{ id: 1 }]);
    });

    it('getContactByEmail should get contact', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.getContactByEmail('test@example.com');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/contacts/email/test@example.com');
      expect(result).toEqual({ id: 1 });
    });

    it('deleteContactById should require userId and delete', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.deleteContactById(1, userId);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/contacts/1', { data: { userId } });
      expect(result).toEqual({ success: true });
    });

    it('deleteContactById should throw if no userId', async () => {
      await expect(gcpApiService.deleteContactById(1, null))
        .rejects.toThrow('User ID required for deleteContactById');
    });

    it('updateContact should patch data', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.updateContact('test@example.com', { name: 'New' }, userId);
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/contacts/test@example.com', { name: 'New', userId });
      expect(result).toEqual({ id: 1 });
    });

    it('updateContact should throw if no userId', async () => {
      await expect(gcpApiService.updateContact('test@example.com', { name: 'New' }, null))
        .rejects.toThrow('User ID required for updateContact');
    });

    it('updateContactById should patch data', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.updateContactById(1, { name: 'New' }, userId);
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/contacts/1', { name: 'New', userId });
      expect(result).toEqual({ id: 1 });
    });

    it('updateContactById should throw if no userId', async () => {
      await expect(gcpApiService.updateContactById(1, { name: 'New' }, null))
        .rejects.toThrow('User ID required for updateContactById');
    });
  });

  describe('Notes API', () => {
    const userId = 'user-123';

    it('createNote should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.createNote(1, 'content', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/contacts/1/notes', { content: 'content', userId });
      expect(result).toEqual({ id: 1 });
    });

    it('getNotesForContact should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.getNotesForContact(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/contacts/1/notes');
      expect(result).toEqual([]);
    });

    it('deleteNote should delete data', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.deleteNote(1);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/notes/1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Integrations API', () => {
    it('listAPIIntegrations should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.listAPIIntegrations();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/integrations');
      expect(result).toEqual([]);
    });

    it('getIntegrationsWithStats should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.getIntegrationsWithStats();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/integrations?stats=true');
      expect(result).toEqual([]);
    });

    it('deleteIntegration should delete data', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.deleteIntegration(1);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/integrations/1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Workflows API', () => {
    it('getWorkflows should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.getWorkflows();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/workflows');
      expect(result).toEqual([]);
    });
  });

  describe('Users API', () => {
    it('getUsers should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.getUsers();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users');
      expect(result).toEqual([]);
    });

    it('updateUserRole should patch data', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.updateUserRole('user-1', 'admin');
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/users/user-1/role', { role: 'admin' });
      expect(result).toEqual({ id: 1 });
    });

    it('deleteUser should delete data', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.deleteUser('user-1');
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/users/user-1');
      expect(result).toEqual({ success: true });
    });

    it('getUserProfile should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { id: 1 } });
      const result = await gcpApiService.getUserProfile('user-1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/user-1/profile');
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('More AI Logging API', () => {
    const userId = 'user-123';

    it('logEvent should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({});
      await gcpApiService.logEvent('login', { info: 1 }, userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/events', { type: 'login', data: { info: 1 }, userId });
    });

    it('logEvent should not throw on failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('fail'));
      await expect(gcpApiService.logEvent('login', {}, userId)).resolves.not.toThrow();
    });

    it('logWorkflowExecution should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.logWorkflowExecution('wf-1', { data: 1 });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/workflows/log', { workflowName: 'wf-1', data: { data: 1 } });
      expect(result).toEqual({ success: true });
    });

    it('getChatHistoryForUser should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.getChatHistoryForUser(userId, 'conv-1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/interactions/history', { params: { userId, conversationId: 'conv-1' } });
      expect(result).toEqual([]);
    });

    it('searchChatHistory should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.searchChatHistory('query', userId);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/interactions/search', { params: { q: 'query', userId } });
      expect(result).toEqual([]);
    });
  });

  describe('More Proxies', () => {
    const userId = 'user-123';

    it('assignCanvasserToTurf should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.assignCanvasserToTurf('contact@example.com', 'turf-1', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/integrations/ground-game', { contactEmail: 'contact@example.com', turfName: 'turf-1', userId });
      expect(result).toEqual({ success: true });
    });
  });

  describe('More Devices', () => {
    const userId = 'user-123';
    const deviceId = 'dev-1';

    it('updateDevice should patch data', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.updateDevice(deviceId, { name: 'New' }, userId);
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(`/devices/${deviceId}`, { updates: { name: 'New' }, userId });
      expect(result).toEqual({ success: true });
    });

    it('updateDevice should throw if no userId', async () => {
      await expect(gcpApiService.updateDevice(deviceId, { name: 'New' }, null))
        .rejects.toThrow('User ID required for updateDevice');
    });

    it('sendDeviceHeartbeat should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.sendDeviceHeartbeat(deviceId, { cpu: 1 });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(`/devices/${deviceId}/heartbeat`, { system_info: { cpu: 1 } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('Metrics', () => {
    it('getDashboardMetrics should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { users: 1 } });
      const result = await gcpApiService.getDashboardMetrics();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/metrics/dashboard');
      expect(result).toEqual({ users: 1 });
    });
  });

  describe('More Projects', () => {
    it('listTasksForProject should get data', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
      const result = await gcpApiService.listTasksForProject(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/projects/1/tasks');
      expect(result).toEqual([]);
    });

    it('updateTaskStatus should patch data', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.updateTaskStatus(1, 'done');
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/tasks/1', { updates: { status: 'done' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('Email', () => {
    const userId = 'user-123';

    it('sendEmail should post data', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { success: true } });
      const result = await gcpApiService.sendEmail('to@example.com', 'Subj', 'Body', userId);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/email/send', { to: 'to@example.com', subject: 'Subj', body: 'Body', userId });
      expect(result).toEqual({ success: true });
    });
  });

  describe('Error handling', () => {
    const userId = 'user-123';

    it('should format DatabaseError appropriately for all standard endpoints', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { data: { error: 'Custom error' } }
      });
      await expect(gcpApiService.getContacts('test', userId))
        .rejects.toThrow(DatabaseError);

      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network failure'));
      await expect(gcpApiService.getContacts('test', userId))
        .rejects.toThrow(DatabaseError);
    });
  });

});
