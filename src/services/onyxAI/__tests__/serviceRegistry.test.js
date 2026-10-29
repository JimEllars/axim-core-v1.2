import { describe, it, expect, vi, beforeEach } from 'vitest';
import serviceRegistry from '../serviceRegistry';
import api from '../api';

vi.mock('../api', () => ({
  default: {
    listAPIIntegrations: vi.fn(),
  },
}));

vi.mock('../../supabaseClient', () => {
  const selectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockImplementation((field, value) => {
      if (field === 'status' && value === 'online') {
        return Promise.resolve({
          data: [
            { name: 'test-node-1', mcp_endpoint: 'http://test-node-1.com/mcp' }
          ],
          error: null
        });
      }
      if (field === 'protocol' && value === 'mcp') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    })
  });

  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: selectMock
      })
    }
  };
});

vi.mock('../../mcp/mcpClient', () => ({
  listTools: vi.fn().mockResolvedValue([])
}));

describe('ServiceRegistry', () => {
  beforeEach(() => {
    // Clear the registry and mocks before each test
    serviceRegistry.services.clear();
    vi.clearAllMocks();
  });

  it('should register a service', () => {
    const service = { name: 'test-service', type: 'internal' };
    serviceRegistry.register('test', service);
    expect(serviceRegistry.getService('test')).toEqual(service);
  });

  it('should get all services', () => {
    serviceRegistry.register('s1', { name: 's1' });
    serviceRegistry.register('s2', { name: 's2' });
    const all = serviceRegistry.getAllServices();
    expect(all).toHaveLength(2);
    const names = all.map(s => s.name);
    expect(names).toContain('s1');
    expect(names).toContain('s2');
  });

  it('should initialize default services', async () => {
    api.listAPIIntegrations.mockResolvedValue([]);

    await serviceRegistry.initialize();

    expect(serviceRegistry.getService('transcribe')).toBeDefined();
    expect(serviceRegistry.getService('ground-game')).toBeDefined();
    expect(serviceRegistry.getService('foreman-os')).toBeDefined();
  });

  it('should fetch and register dynamic integrations from API', async () => {
    const dynamicIntegrations = [
      { name: 'My Custom Endpoint', type: 'data plane endpoint', base_url: 'http://example.com' }
    ];
    api.listAPIIntegrations.mockResolvedValue(dynamicIntegrations);

    await serviceRegistry.initialize();

    const serviceKey = 'my-custom-endpoint';
    const service = serviceRegistry.getService(serviceKey);
    expect(service).toBeDefined();
    expect(service.name).toBe('My Custom Endpoint');
    expect(service.endpoint).toBe('http://example.com');
  });

  it('should handle API errors gracefully during initialization', async () => {
    api.listAPIIntegrations.mockRejectedValue(new Error('API Error'));

    await expect(serviceRegistry.initialize()).resolves.not.toThrow();

    expect(serviceRegistry.getService('transcribe')).toBeDefined();
  });

  it('should load and register ecosystem nodes correctly', async () => {
    await serviceRegistry.loadEcosystemNodes();

    const nodeService = serviceRegistry.getService('mcp:test-node-1');
    expect(nodeService).toBeDefined();
    expect(nodeService.name).toBe('test-node-1');
    expect(nodeService.endpoint).toBe('http://test-node-1.com/mcp');
  });
});
