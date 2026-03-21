import { describe, it, expect, vi, beforeEach } from 'vitest';
import webCommands from '../webCommands';
import api from '../../api';
import * as llm from '../../llm';

// Mock dependencies with factory functions
vi.mock('../../api', () => ({
  default: {
    fetchUrl: vi.fn(),
    triggerContentEngine: vi.fn(),
  },
}));
vi.mock('../../llm', () => ({
  generateContent: vi.fn(),
}));

// Mock the window.open function
global.window = {
  open: vi.fn(),
};

describe('webCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const findCommand = (name) => webCommands.find(cmd => cmd.name === name);

  describe('generateNews', () => {
    const generateNewsCommand = findCommand('generateNews');

    it('should be defined', () => {
      expect(generateNewsCommand).toBeDefined();
    });

    it('should trigger content engine and return success message', async () => {
      const url = 'https://example.com/news';
      const mockResponse = {
        results: [{
          status: 'success',
          id: '12345',
          title: 'Test Article'
        }]
      };

      api.triggerContentEngine.mockResolvedValue(mockResponse);

      const result = await generateNewsCommand.execute({ URL: url });

      expect(api.triggerContentEngine).toHaveBeenCalledWith({ urls: [url] });
      expect(result).toContain('**Title:** Test Article');
      expect(result).toContain('**ID:** `12345`');
    });

    it('should handle failures from content engine', async () => {
       const url = 'https://example.com/fail';
       const mockResponse = {
         results: [{
           status: 'failed',
           error: 'Generation failed'
         }]
       };
       api.triggerContentEngine.mockResolvedValue(mockResponse);

       await expect(generateNewsCommand.execute({ URL: url })).rejects.toThrow('Generation failed');
    });
  });

  describe('fetch', () => {
    const fetchCommand = findCommand('fetch');

    it('should be defined', () => {
      expect(fetchCommand).toBeDefined();
    });

    it('should fetch and summarize a URL successfully', async () => {
      const url = 'https://example.com';
      const mockContent = 'This is the web page content.';
      const mockSummary = 'This is a summary.';

      api.fetchUrl.mockResolvedValue({ content: mockContent, error: null });
      llm.generateContent.mockResolvedValue(mockSummary);

      const result = await fetchCommand.execute({ URL: url });

      expect(api.fetchUrl).toHaveBeenCalledWith(url);
      expect(llm.generateContent).toHaveBeenCalledWith(expect.stringContaining(mockContent));
      expect(result).toBe(`✅ Summary for ${url}:\n\n${mockSummary}`);
    });

    it('should throw an error for a failed fetch', async () => {
      const url = 'https://example.com';
      api.fetchUrl.mockResolvedValue({ content: null, error: 'Failed to fetch' });
      // Spy on console.error to suppress the expected error log in the test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // The original error message is wrapped by the catch block.
      await expect(fetchCommand.execute({ URL: url })).rejects.toThrow('An error occurred while trying to fetch the URL: Failed to fetch content from URL: Failed to fetch');

      // Verify that the error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Clean up the spy
      consoleErrorSpy.mockRestore();
    });
  });

  describe('open', () => {
    const openCommand = findCommand('open');

    it('should be defined', () => {
      expect(openCommand).toBeDefined();
    });

    it('should open a valid URL', async () => {
      const url = 'https://axim.systems';
      await openCommand.execute({ URL: url });
      expect(window.open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    });

    it('should prepend "https://" to a URL without a protocol', async () => {
      const url = 'axim.systems';
      await openCommand.execute({ URL: url });
      expect(window.open).toHaveBeenCalledWith('https://' + url, '_blank', 'noopener,noreferrer');
    });
  });
});
