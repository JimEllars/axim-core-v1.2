import { describe, it, expect, vi, beforeEach } from 'vitest';
import externalCommands from '../externalCommands';
import api from '../../api';

// Mock the API dependency
vi.mock('../../api');

describe('External Commands - Canvasser Assignment', () => {
  const assignCommand = externalCommands.find(c => c.name === 'assignCanvasser');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse "assign canvasser ... to ..." correctly', () => {
    const input = 'assign canvasser test@example.com to turf NorthTurf';
    const result = assignCommand.parse(input);
    expect(result).toEqual({ email: 'test@example.com', turf: 'NorthTurf' });
  });

  it('should execute assignCanvasserToTurf API', async () => {
    const mockContext = { aximCore: { api, userId: 'test-user' }, userId: 'test-user' };
    // Change mock to return 'success' status so the command returns the success message
    const mockApiResult = { assignmentId: '123', status: 'success' };

    api.assignCanvasserToTurf.mockResolvedValue(mockApiResult);

    // Mock service registry check
    vi.mock('../serviceRegistry', () => ({ default: { getService: () => true } }));

    const result = await assignCommand.execute({ email: 'test@example.com', turf: 'NorthTurf' }, mockContext);

    expect(api.assignCanvasserToTurf).toHaveBeenCalledWith('test@example.com', 'NorthTurf', 'test-user');
    expect(result.message).toContain('Canvasser test@example.com assigned to turf NorthTurf');
  });

  it('should handle API errors', async () => {
    const mockContext = { aximCore: { api, userId: 'test-user' }, userId: 'test-user' };
    api.assignCanvasserToTurf.mockRejectedValue(new Error('API Fail'));

    await expect(assignCommand.execute({ email: 'test@example.com', turf: 'NorthTurf' }, mockContext))
      .rejects.toThrow('API Fail');
  });
});
