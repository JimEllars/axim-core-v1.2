import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyPaymentIntent } from '../paymentVerification';
import config from '../../../config';

// Mock the config module
vi.mock('../../../config', () => ({
  default: {
    backendUrl: 'http://test-backend.com'
  }
}));

describe('paymentVerification service', () => {
  const mockPaymentIntentId = 'pi_12345';
  const mockPartnerKey = 'pk_test_key';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Suppress console.error in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('verifyPaymentIntent', () => {
    it('should throw an error if paymentIntentId is missing', async () => {
      await expect(verifyPaymentIntent(null)).rejects.toThrow('paymentIntentId is required for verification.');
      await expect(verifyPaymentIntent('')).rejects.toThrow('paymentIntentId is required for verification.');
    });

    it('should call fetch with the correct endpoint, method, and headers (no partnerKey)', async () => {
      const mockResponse = { success: true, status: 'succeeded' };
      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await verifyPaymentIntent(mockPaymentIntentId);

      expect(fetch).toHaveBeenCalledWith(
        'http://test-backend.com/payments/verify',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paymentIntentId: mockPaymentIntentId }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should include Authorization header when partnerKey is provided', async () => {
      const mockResponse = { success: true };
      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await verifyPaymentIntent(mockPaymentIntentId, mockPartnerKey);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockPartnerKey}`,
          }),
        })
      );
    });

    it('should throw an error if the response is not ok', async () => {
      const errorMsg = 'Invalid payment intent';
      fetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: errorMsg }),
      });

      await expect(verifyPaymentIntent(mockPaymentIntentId)).rejects.toThrow(errorMsg);
    });

    it('should throw a default error message if response is not ok and no error message is provided', async () => {
      fetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(verifyPaymentIntent(mockPaymentIntentId)).rejects.toThrow('Payment verification failed.');
    });

    it('should throw an error if fetch fails (network error)', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValue(networkError);

      await expect(verifyPaymentIntent(mockPaymentIntentId)).rejects.toThrow(networkError);
      expect(console.error).toHaveBeenCalledWith('Error verifying payment intent:', networkError);
    });
  });
});
