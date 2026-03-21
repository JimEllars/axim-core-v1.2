// src/services/onyxAI/commands/__tests__/external.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import externalCommands from '../externalCommands';
import serviceRegistry from '../../serviceRegistry';

vi.mock('../../serviceRegistry', () => ({
  default: {
    getService: vi.fn(),
  },
}));

describe('externalCommands', () => {
  let transcribeCommand;
  let assignCanvasserCommand;
  let foremanCommand;
  let mockAximCore;

  beforeEach(() => {
    vi.clearAllMocks();
    transcribeCommand = externalCommands.find(cmd => cmd.name === 'transcribe');
    assignCanvasserCommand = externalCommands.find(cmd => cmd.name === 'assignCanvasser');
    foremanCommand = externalCommands.find(cmd => cmd.name === 'foreman');

    mockAximCore = {
      api: {
        initiateTranscription: vi.fn(),
        assignCanvasserToTurf: vi.fn(),
        invokeAximService: vi.fn(),
      },
      userId: 'test-user-123',
    };

    // Default: Services are available
    serviceRegistry.getService.mockReturnValue({ name: 'mock-service' });
  });

  describe('transcribe', () => {
    it('should be defined', () => {
      expect(transcribeCommand).toBeDefined();
    });

    it('should call the ApiService and return a success object', async () => {
      const source = '/path/to/audio.mp3';
      const mockResponse = {
        transcriptionId: 'transcript_abc123',
        status: 'pending',
      };
      mockAximCore.api.initiateTranscription.mockResolvedValue(mockResponse);

      const result = await transcribeCommand.execute({ source }, { aximCore: mockAximCore });

      expect(mockAximCore.api.initiateTranscription).toHaveBeenCalledWith(source, 'test-user-123');
      expect(result).toEqual({
        message: `Transcription for "${source}" has been initiated.`,
        transcriptionId: 'transcript_abc123',
        status: 'pending'
      });
    });

    it('should return a message indicating the request is queued when offline', async () => {
      const source = 'offline/audio.mp3';
      const mockResponse = {
        status: 'queued',
      };
      mockAximCore.api.initiateTranscription.mockResolvedValue(mockResponse);

      const result = await transcribeCommand.execute({ source }, { aximCore: mockAximCore });

      expect(mockAximCore.api.initiateTranscription).toHaveBeenCalledWith(source, 'test-user-123');
      expect(result).toEqual({
        message: `Request to transcribe "${source}" has been queued as you are offline. It will be processed when you reconnect.`,
        status: 'queued',
        source
      });
    });

    it('should have the correct category and usage information', () => {
      expect(transcribeCommand.category).toBe('External');
      expect(transcribeCommand.usage).toBe('transcribe <file_path_or_url>');
    });
  });

  describe('assignCanvasser', () => {
    it('should call assignCanvasserToTurf and return object', async () => {
      const email = 'john@example.com';
      const turf = 'Turf A';
      mockAximCore.api.assignCanvasserToTurf.mockResolvedValue({ assignmentId: '123' });

      const result = await assignCanvasserCommand.execute({ email, turf }, { aximCore: mockAximCore });

      expect(mockAximCore.api.assignCanvasserToTurf).toHaveBeenCalledWith(email, turf, 'test-user-123');
      expect(result).toEqual({
        message: `Canvasser ${email} assigned to turf ${turf}.`,
        assignmentId: '123',
        email,
        turf
      });
    });

    it('should parse natural language commands correctly', () => {
      const command = 'assign canvasser john@example.com to turf Downtown';
      const result = assignCanvasserCommand.parse(command);
      expect(result).toEqual({
        email: 'john@example.com',
        turf: 'Downtown'
      });
    });

    it('should return empty object for unmatched parse', () => {
       const command = 'invalid command format';
       const result = assignCanvasserCommand.parse(command);
       expect(result).toEqual({});
    });
  });

  describe('foreman', () => {
    it('should call invokeAximService and return raw object', async () => {
      const action = 'status';
      const mockData = { status: 'ok', tasks: [] };
      mockAximCore.api.invokeAximService.mockResolvedValue(mockData);

      const result = await foremanCommand.execute({ action }, { aximCore: mockAximCore });

      expect(mockAximCore.api.invokeAximService).toHaveBeenCalledWith('foreman-os', action, {}, 'test-user-123');
      expect(result).toEqual(mockData);
    });
  });
});
