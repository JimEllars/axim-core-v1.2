import { describe, it, expect, vi, beforeEach } from 'vitest';
import serviceRegistry from '../serviceRegistry';
import api from '../api';

// Mock the api dependency
vi.mock('../api', () => ({
  default: {
    listAPIIntegrations: vi.fn(),
  },
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
    // Since it's a map, order matches insertion, but let's just check containment
    const names = all.map(s => s.name);
    expect(names).toContain('s1');
    expect(names).toContain('s2');
  });

  it('should initialize default services', async () => {
    // Mock api to return empty list
    api.listAPIIntegrations.mockResolvedValue([]);

    await serviceRegistry.initialize();

    expect(serviceRegistry.getService('transcribe')).toBeDefined();
    expect(serviceRegistry.getService('ground-game')).toBeDefined();
    expect(serviceRegistry.getService('foreman-os')).toBeDefined();
  });

  it('should fetch and register dynamic integrations from API', async () => {
    const dynamicIntegrations = [
      { name: 'My Custom API', type: 'webhook', base_url: 'http://example.com' }
    ];
    api.listAPIIntegrations.mockResolvedValue(dynamicIntegrations);

    await serviceRegistry.initialize();

    // Check if dynamic service is registered (key should be normalized: lowercase and spaces to dashes)
    const key = 'my-custom-api';
    const service = serviceRegistry.getService(key);
    expect(service).toBeDefined();
    expect(service.name).toBe('My Custom API');
    expect(service.endpoint).toBe('http://example.com');
  });

  it('should handle API errors gracefully during initialization', async () => {
    api.listAPIIntegrations.mockRejectedValue(new Error('API Error'));

    // Should not throw
    await expect(serviceRegistry.initialize()).resolves.not.toThrow();

    // Default services should still be there
    expect(serviceRegistry.getService('transcribe')).toBeDefined();
  });
});
