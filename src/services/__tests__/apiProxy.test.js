import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitMicroAppTelemetry } from '../apiProxy';
import logger from '../logging/index';

vi.mock('../logging/index', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

describe('apiProxy Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submitMicroAppTelemetry should cleanly reject invalid structural shapes and route to dead-letter queue (simulated)', async () => {
    const invalidPayload = { invalid_key: "value" };

    // Call the function directly
    try {
        await submitMicroAppTelemetry(invalidPayload);
    } catch (e) {
        // Handle error if thrown
    }

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Invalid payload format for decentralized ledger telemetry"));
  });
});
