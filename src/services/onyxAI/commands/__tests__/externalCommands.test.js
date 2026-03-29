import { describe, it, expect, vi, beforeEach } from 'vitest';
import externalCommands from '../externalCommands';
import memoryCommands from '../memoryCommands';

// Move the mock before the import so it applies correctly
vi.mock('../../llm', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

// Mock dependencies
const mockApi = {
  initiateTranscription: vi.fn(),
  assignCanvasserToTurf: vi.fn(),
  searchChatHistory: vi.fn(),
  searchMemory: vi.fn()
};

const mockAximCore = {
  api: mockApi,
  userId: 'test-user-id'
};

const mockServiceRegistry = {
  getService: vi.fn((name) => ({ name, status: 'online' }))
};

// Mock the service registry import
vi.mock('../../serviceRegistry', () => ({
  default: {
    getService: (name) => mockServiceRegistry.getService(name)
  }
}));

describe('External & Memory Commands Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transcribe command', () => {
    const transcribeCommand = externalCommands.find(c => c.name === 'transcribe');

    it('should call initiateTranscription with correct args', async () => {
      mockApi.initiateTranscription.mockResolvedValue({ transcriptionId: '123', status: 'processing' });

      const args = { source: 'https://example.com/audio.mp3' };
      const result = await transcribeCommand.execute(args, { aximCore: mockAximCore });

      expect(mockApi.initiateTranscription).toHaveBeenCalledWith(args.source, mockAximCore.userId);
      expect(result).toEqual(expect.objectContaining({
        message: expect.stringContaining('initiated'),
        transcriptionId: '123'
      }));
    });

    it('should handle offline queuing', async () => {
      mockApi.initiateTranscription.mockResolvedValue({ status: 'queued' });

      const args = { source: 'local-file.mp3' };
      const result = await transcribeCommand.execute(args, { aximCore: mockAximCore });

      expect(result).toEqual(expect.objectContaining({
        status: 'queued',
        message: expect.stringContaining('queued')
      }));
    });
  });

  describe('assignCanvasser command', () => {
    const assignCommand = externalCommands.find(c => c.name === 'assignCanvasser');

    it('should parse natural language input correctly', () => {
        const input = "assign canvasser john.doe@example.com to turf North-West";
        const parsed = assignCommand.parse(input);
        expect(parsed).toEqual({
            email: 'john.doe@example.com',
            turf: 'North-West'
        });
    });

    it('should call assignCanvasserToTurf with correct args', async () => {
      mockApi.assignCanvasserToTurf.mockResolvedValue({ assignmentId: 'abc-123' });

      const args = { email: 'john@example.com', turf: 'Downtown' };
      const result = await assignCommand.execute(args, { aximCore: mockAximCore });

      expect(mockApi.assignCanvasserToTurf).toHaveBeenCalledWith(args.email, args.turf, mockAximCore.userId);
      expect(result).toEqual(expect.objectContaining({
        message: expect.stringContaining('assigned'),
        assignmentId: 'abc-123'
      }));
    });
  });

  describe('searchMemory command', () => {
    const searchCommand = memoryCommands.find(c => c.name === 'searchMemory');

    it('should call searchChatHistory with query', async () => {
      mockApi.searchMemory.mockResolvedValue([
        { created_at: '2023-01-01T10:00:00Z', command: 'hello', response: 'hi there' }
      ]);

      const args = { query: 'hello' };
      const result = await searchCommand.execute(args, { aximCore: mockAximCore, userId: mockAximCore.userId });

      expect(mockApi.searchMemory).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, 'test-user-id');
      expect(result.message).toContain('Memory Search Results');
      expect(result.message).toContain('hi there');
      expect(result.type).toBe('markdown');
    });

    it('should handle empty results gracefully', async () => {
        mockApi.searchMemory.mockResolvedValue([]);

        const args = { query: 'nonexistent' };
        const result = await searchCommand.execute(args, { aximCore: mockAximCore, userId: mockAximCore.userId });

        expect(result.message).toContain("couldn't find any past conversations");
        expect(result.type).toBe('text');
      });
  });
});
