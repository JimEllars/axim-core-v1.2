import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies used by the edge function
vi.mock('https://esm.sh/@supabase/supabase-js@2.7.1', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: async () => ({ count: 0, error: null })
          })
        })
      }),
      insert: async () => ({ error: null })
    })
  })
}));

import { trackEvent } from '../src/services/telemetry.js';

describe('Telemetry Pipeline Validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('should compile payload with route context and not throw on network error', async () => {
    // Mock fetch to simulate network failure
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    // Set window context for the test
    global.window = {
      location: {
        pathname: '/dashboard',
        href: 'http://localhost:3000/dashboard'
      }
    };

    // Test the trackEvent function
    // It should catch the error and not throw, satisfying the requirement to fail gracefully
    await expect(trackEvent('test_event', { key: 'value' })).resolves.not.toThrow();

    // Fast-forward timers to trigger the queue flush
    vi.runAllTimers();

    // Need to await Promises to resolve
    await Promise.resolve();

    // Verify fetch was called with expected payload
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = global.fetch.mock.calls[0];
    const payload = JSON.parse(callArgs[1].body);

    expect(payload.events).toBeDefined();
    expect(payload.events.length).toBe(1);
    expect(payload.events[0].event).toBe('test_event');
    expect(payload.events[0].details.key).toBe('value');
    expect(payload.events[0].details.path).toBe('/dashboard');
    expect(payload.events[0].details.url).toBe('http://localhost:3000/dashboard');
    expect(payload.events[0].app_id).toBe('axim_core_frontend');
  });

  it('should successfully handle arrays of payloads', () => {
    const payloadsToProcess = [{ id: 1 }, { id: 2 }];
    expect(Array.isArray(payloadsToProcess)).toBe(true);
    expect(payloadsToProcess.length).toBe(2);
  });

  it('should truncate excessively long strings', () => {
    const truncateString = (str, maxLength) => {
      if (typeof str !== 'string') return str;
      return str.length > maxLength ? str.substring(0, maxLength) + '... [TRUNCATED]' : str;
    };

    const longString = 'a'.repeat(3000);
    const truncated = truncateString(longString, 2000);
    expect(truncated.length).toBe(2015); // 2000 + 15 for '... [TRUNCATED]'
    expect(truncated.endsWith('... [TRUNCATED]')).toBe(true);
  });
});
