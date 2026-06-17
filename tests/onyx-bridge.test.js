import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../src/services/onyxAI/api';

describe('Onyx Edge Bridge', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv('VITE_ONYX_WORKER_URL', 'https://onyx.edge.test');
    vi.stubEnv('VITE_ONYX_SECURE_KEY', 'test_secure_key');
    api.supabase = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } };
  });

  it('routes correctly through sendToOnyxWorker on success', async () => {
    const mockPayload = { prompt: "Test", options: {} };
    const mockResponse = { content: "Onyx mk3 response" };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.sendToOnyxWorker(mockPayload);

    expect(fetchMock).toHaveBeenCalledWith('https://onyx.edge.test/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_secure_key'
      },
      body: JSON.stringify(mockPayload)
    });
    expect(result).toEqual(mockResponse);
  });

  it('fails soft when edge worker is unavailable', async () => {
    const mockPayload = { prompt: "Test", options: {} };

    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.sendToOnyxWorker(mockPayload)).rejects.toThrow('Network error');
  });
});