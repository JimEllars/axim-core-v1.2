// src/services/onyxAI/commands/__tests__/aximService.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest';
import aximServiceCommands from '../aximServiceCommands';
import api from '../../api';

// Mock the API module
vi.mock('../../api');

const aximServiceCommand = aximServiceCommands[0];

describe('axim-service command', () => {
  let context;

  beforeEach(() => {
    vi.resetAllMocks();
    context = {
      userId: 'test-user-id',
    };
  });

  it('should return an error for invalid usage (not enough arguments)', async () => {
    // The parser handles positional args and returns an object.
    // If usage is incorrect (regex mismatch), parse returns {}.
    const args = {};
    const result = await aximServiceCommand.execute(args, context);
    expect(result.type).toBe('error');
    expect(result.message).toContain('Invalid usage');
  });

  it('should return an error for invalid JSON payload', async () => {
    const args = {
        serviceName: 'transcription',
        endpoint: 'start',
        payloadString: 'not-a-json-string'
    };
    const result = await aximServiceCommand.execute(args, context);
    expect(result.type).toBe('error');
    expect(result.message).toContain('Invalid JSON payload');
  });

  it('should return an error if userId is missing from context', async () => {
    const args = {
        serviceName: 'transcription',
        endpoint: 'start',
        payloadString: '{"file": "audio.mp3"}'
    };
    const result = await aximServiceCommand.execute(args, {}); // Empty context
    expect(result.type).toBe('error');
    expect(result.message).toContain('User ID context is missing');
  });

  it('should call the api.invokeAximService with correct parameters on valid input', async () => {
    const args = {
        serviceName: 'transcription',
        endpoint: 'start',
        payloadString: '{"file": "audio.mp3"}'
    };
    const expectedPayload = { file: 'audio.mp3' };
    api.invokeAximService.mockResolvedValue({ status: 'ok' });

    await aximServiceCommand.execute(args, context);

    expect(api.invokeAximService).toHaveBeenCalledWith(
      'transcription',
      'start',
      expectedPayload,
      context.userId
    );
  });

  it('should return a success message when the API call is successful', async () => {
    const args = {
        serviceName: 'transcription',
        endpoint: 'start',
        payloadString: '{"file": "audio.mp3"}'
    };
    const mockResponse = { jobId: '123', status: 'pending' };
    api.invokeAximService.mockResolvedValue(mockResponse);

    const result = await aximServiceCommand.execute(args, context);

    expect(result.type).toBe('success');
    expect(result.message).toContain("Successfully called AXiM service 'transcription'");
    expect(result.data).toEqual(mockResponse);
  });

  it('should return an error message when the API call fails', async () => {
    const args = {
        serviceName: 'transcription',
        endpoint: 'start',
        payloadString: '{"file": "audio.mp3"}'
    };
    const errorMessage = 'Service unavailable';
    api.invokeAximService.mockRejectedValue(new Error(errorMessage));

    const result = await aximServiceCommand.execute(args, context);

    expect(result.type).toBe('error');
    expect(result.message).toContain(`Error calling AXiM service 'transcription': ${errorMessage}`);
  });
});
