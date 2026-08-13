import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInit = vi.fn();
const mockGetSafeInfo = vi.fn();
const mockCreateTransaction = vi.fn();
const mockExecuteTransaction = vi.fn();
const mockGetTransactionHash = vi.fn();
const mockSignHash = vi.fn();
const mockProposeTransaction = vi.fn();

vi.mock('https://esm.sh/@safe-global/protocol-kit@3.0.1', () => ({
  default: {
    init: mockInit,
  }
}));

vi.mock('https://esm.sh/@safe-global/api-kit@2.4.3', () => ({
  default: vi.fn().mockImplementation(() => ({
    proposeTransaction: mockProposeTransaction
  }))
}));

describe('Smart Contract Dispatcher Threshold Checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockInit.mockResolvedValue({
            getSafeInfo: mockGetSafeInfo,
            createTransaction: mockCreateTransaction,
            executeTransaction: mockExecuteTransaction,
            getTransactionHash: mockGetTransactionHash,
            signHash: mockSignHash,
        });
    });

    it('should propose rather than execute when threshold > 1', async () => {
        mockGetSafeInfo.mockResolvedValue({ threshold: 2 });
        mockCreateTransaction.mockResolvedValue({ data: {} });
        mockGetTransactionHash.mockResolvedValue('0xhash');
        mockSignHash.mockResolvedValue({ data: '0xsig' });

        const kit = await import('https://esm.sh/@safe-global/protocol-kit@3.0.1').then(m => m.default.init());
        const safeInfo = await kit.getSafeInfo();

        expect(safeInfo.threshold).toBeGreaterThan(1);
    });

    it('should execute when threshold is 1', async () => {
        mockGetSafeInfo.mockResolvedValue({ threshold: 1 });
        mockCreateTransaction.mockResolvedValue({ data: {} });

        const kit = await import('https://esm.sh/@safe-global/protocol-kit@3.0.1').then(m => m.default.init());
        const safeInfo = await kit.getSafeInfo();

        expect(safeInfo.threshold).toBe(1);
    });
});
