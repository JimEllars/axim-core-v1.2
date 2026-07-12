import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callApiProxy, validateDecentralizedLedgerPayload, submitMicroAppTelemetry, logSmartContractPayment } from './apiProxy';
import { supabase } from './supabaseClient';
import logger from './logging';

vi.mock('./supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        setHeader: vi.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }))
  }
}));

vi.mock('./logging', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('apiProxy Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateDecentralizedLedgerPayload', () => {
    it('returns true for valid payload', () => {
      expect(validateDecentralizedLedgerPayload({ app_id: 'test', endpoint: '/test' })).toBe(true);
    });
    it('returns false for invalid payload', () => {
      expect(validateDecentralizedLedgerPayload({ app_id: 'test' })).toBe(false);
      expect(validateDecentralizedLedgerPayload(null)).toBe(false);
    });
  });

  describe('submitMicroAppTelemetry', () => {
    it('submits valid telemetry payload successfully', async () => {
      const payload = { app_id: 'test_app', endpoint: '/test' };
      await submitMicroAppTelemetry(payload);
      expect(supabase.from).toHaveBeenCalledWith('api_usage_logs');
    });

    it('routes invalid payload to dead letter logs', async () => {
      const payload = { app_id: 'test_app' }; // missing endpoint
      await submitMicroAppTelemetry(payload);
      expect(supabase.from).toHaveBeenCalledWith('hitl_dead_letter_logs');
      expect(logger.error).toHaveBeenCalledWith('Invalid payload format for decentralized ledger telemetry. Routing to Dead-Letter Ingress.');
    });
  });

  describe('logSmartContractPayment', () => {
    it('logs USDC payment confirmation successfully', async () => {
      const paymentDetails = { payment_contract_id: 'contract_123', multi_chain_hash: 'hash_456' };
      const result = await logSmartContractPayment(paymentDetails);
      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Logging USDC payment confirmation for contract: contract_123');
    });

    it('returns false for invalid payment details', async () => {
      const result = await logSmartContractPayment(null);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Invalid partnership payment ledger entry.');
    });
  });
});
