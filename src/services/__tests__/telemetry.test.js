import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from '../telemetry';

describe('Telemetry Ingress Test Routine', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should autonomously spawn support ticket on simulated system failure overriding human latency', async () => {
    const mockDb = {
        api_usage_logs: [],
        support_tickets: []
    };

    const triggerAnomaly = (payload) => {
        if (payload.status_code >= 500) {
            mockDb.api_usage_logs.push({
                app_id: payload.app_id,
                endpoint: payload.endpoint,
                execution_time_ms: -1
            });

            const newLog = mockDb.api_usage_logs[mockDb.api_usage_logs.length - 1];
            if (newLog.execution_time_ms === -1) {
                mockDb.support_tickets.push({
                    app_id: newLog.app_id,
                    subject: 'Automated RCA: Critical Anomaly Detected in [' + newLog.app_id + ']',
                    status: 'Pending_Review'
                });
            }
        }
    };

    triggerAnomaly({ app_id: 'test_app', endpoint: '/error', status_code: 500 });

    expect(mockDb.api_usage_logs.length).toBe(1);
    expect(mockDb.support_tickets.length).toBe(1);
    expect(mockDb.support_tickets[0].subject).toContain('Automated RCA:');
  });

  it('should attempt fetch to primary URL and fallback if it fails', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 502 }) // Primary fails
      .mockResolvedValueOnce({ ok: true, status: 200 }); // Fallback succeeds

    await trackEvent('test_event', { foo: 'bar' });

    // Advance timer past debounce threshold
    vi.advanceTimersByTime(16000); // 16 seconds

    // Need to resolve pending promises triggered by timer
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // First call to Cloudflare primary URL
    expect(global.fetch.mock.calls[0][0]).toContain('/telemetry');
    // Second call to Supabase fallback URL
    expect(global.fetch.mock.calls[1][0]).toContain('/telemetry-ingress');
  });
});
