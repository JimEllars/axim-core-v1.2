import { describe, it, expect, vi, beforeEach } from 'vitest';
import exportCommands from '../exportCommands';
import api from '../../api';

// Mock the API dependency
vi.mock('../../api');

describe('Export Commands - Drive Backup', () => {
  const exportCommand = exportCommands.find(c => c.name === 'export');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse "export to drive" correctly', () => {
    const input = 'export to drive';
    const result = exportCommand.parse(input, {});
    expect(result).toEqual({ TYPE: 'drive', FORMAT: 'none' });
  });

  it('should call triggerDataExport when executing drive export', async () => {
    const mockContext = { aximCore: {}, userId: 'test-user' };
    const mockApiResult = { message: 'Export started', fileName: 'test.csv' };

    api.triggerDataExport.mockResolvedValue(mockApiResult);

    const result = await exportCommand.execute({ TYPE: 'drive', FORMAT: 'none' }, mockContext);

    expect(api.triggerDataExport).toHaveBeenCalled();
    expect(result.type).toBe('success');
    expect(result.message).toContain('Cloud Backup Triggered');
    expect(result.message).toContain('test.csv');
  });

  it('should handle errors during drive export', async () => {
    const mockContext = { aximCore: {}, userId: 'test-user' };
    const error = new Error('Export failed');

    api.triggerDataExport.mockRejectedValue(error);

    await expect(exportCommand.execute({ TYPE: 'drive', FORMAT: 'none' }, mockContext))
      .rejects.toThrow('Export failed');
  });
});
