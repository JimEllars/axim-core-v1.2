// src/services/onyxAI/onyxAI.test.js
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import OnyxAI from './index';
import * as llm from './llm';
import { IntentParsingError, CommandNotFoundError, CommandExecutionError } from './errors';
import logger from '../logging';

// Mock dependencies at the top level.
vi.mock('./llm', () => ({
  generateContent: vi.fn(),
  generateEmbedding: vi.fn().mockResolvedValue([0,0,0]),
  getCurrentProvider: vi.fn().mockReturnValue({ provider: 'mock', model: 'mock-model' }),
  loadProviders: vi.fn(), // Mock the async initializer
}));

vi.mock('./memory', () => ({
  default: {
    initialize: vi.fn(),
    addMessage: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    loadHistory: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('./serviceRegistry', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(),
    getService: vi.fn(),
  },
}));

vi.mock('../logging');

// Create a mutable mock for the ApiService
const mockApi = {
  initialize: vi.fn(),
  logAIInteraction: vi.fn(),
};

// Create mutable mocks for managers
const mockConnectivityManager = {
  getIsOnline: vi.fn(() => true),
};

const mockOfflineManager = {
  queueCommand: vi.fn(),
};

describe('OnyxAI', () => {
    // Clear mocks before each test to ensure isolation.
    beforeEach(async () => {
        vi.clearAllMocks();
        // Default success case for initialization
        llm.loadProviders.mockResolvedValue();
        // Ensure getCurrentProvider returns a valid object
        llm.getCurrentProvider.mockReturnValue({ provider: 'mock', model: 'mock-model' });
        mockApi.logAIInteraction.mockResolvedValue();

        // Initialize OnyxAI with the mocked dependencies
        await OnyxAI.initialize({}, 'test-user', {
          api: mockApi,
          connectivityManager: mockConnectivityManager,
          offlineManager: mockOfflineManager
        });
    });

    // Restore mocks after all tests are done.
    afterAll(() => {
        vi.restoreAllMocks();
    });

  it('should be instantiated and initialized', async () => {
    expect(OnyxAI).toBeDefined();
    expect(OnyxAI.name).toBe('Onyx');
    // The beforeEach block already initializes, so we just check the state.
    expect(OnyxAI.isInitialized).toBe(true);
  });

  it('should handle initialization failure', async () => {
    // Force an error during initialization of a dependency
    llm.loadProviders.mockRejectedValue(new Error('Provider manager failed'));

    // Re-initialize with the failure condition
    await OnyxAI.initialize({}, 'test-user', {
      api: mockApi,
      connectivityManager: mockConnectivityManager,
      offlineManager: mockOfflineManager
    });

    expect(OnyxAI.isInitialized).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('OnyxAI initialization failed:', expect.any(Error));
  });

  describe('getIntentsFromLLM', () => {
    it('should generate a simplified prompt and request JSON output', async () => {
      const userInput = "what is the status of the system?";
      const expectedResponse = { command: 'getSystemReport', args: {} };

      llm.generateContent.mockResolvedValue(JSON.stringify(expectedResponse));

      await OnyxAI.getIntentsFromLLM(userInput);

      expect(llm.generateContent).toHaveBeenCalledTimes(1);

      const prompt = llm.generateContent.mock.calls[0][0];
      expect(prompt).toContain(`Analyze the user's command: "${userInput}"`);
      expect(prompt).toContain(`"command": "getAIStatus"`);
      expect(prompt).not.toContain("**Strict Output Requirements:**");

      const options = llm.generateContent.mock.calls[0][1];
      expect(options).toEqual({ max_tokens: 250, json: true });
    });

    it('should throw IntentParsingError if LLM response is not valid JSON', async () => {
      const userInput = "create a new marketing campaign";
      const llmOutput = 'An error occurred.';
      llm.generateContent.mockResolvedValue(llmOutput);

      // Use rejects.toThrow for async error validation.
      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(IntentParsingError);
      expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", expect.any(SyntaxError), { response: llmOutput });
    });

    it('should throw IntentParsingError for malformed JSON', async () => {
        const userInput = "show me something";
        const llmOutput = '{"command": "show", "args": {"item": "something"'; // Missing closing brace
        llm.generateContent.mockResolvedValue(llmOutput);

        await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(IntentParsingError);
        expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", expect.any(SyntaxError), { response: llmOutput });
      });

    it('should throw IntentParsingError if llm.generateContent throws a SyntaxError directly', async () => {
      const userInput = "some command";
      const syntaxError = new SyntaxError("Unexpected token");
      llm.generateContent.mockRejectedValue(syntaxError);

      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(IntentParsingError);
      expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", syntaxError, { response: undefined });
    });

    it('should re-throw IntentParsingError if llm.generateContent throws it', async () => {
      const userInput = "do something";
      const customError = new IntentParsingError("Custom parsing error");
      llm.generateContent.mockRejectedValue(customError);

      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(customError);
      expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", customError, { response: undefined });
    });

    it('should re-throw CommandExecutionError if llm.generateContent throws it', async () => {
      const userInput = "do something";
      const customError = new CommandExecutionError("Custom execution error");
      llm.generateContent.mockRejectedValue(customError);

      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(customError);
      expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", customError, { response: undefined });
    });

    it('should throw CommandExecutionError for generic network or API errors', async () => {
      const userInput = "do something";
      const networkError = new Error("Network timeout");
      llm.generateContent.mockRejectedValue(networkError);

      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow(CommandExecutionError);
      await expect(OnyxAI.getIntentsFromLLM(userInput)).rejects.toThrow("An unexpected error occurred while communicating with the AI: Network timeout");
      expect(logger.error).toHaveBeenCalledWith("An error occurred in getIntentsFromLLM.", networkError, { response: undefined });
    });
  });

  describe('routeCommand', () => {
    let getCommandSpy;

    beforeEach(() => {
      // Set up a spy on getCommand before each test in this block
      getCommandSpy = vi.spyOn(OnyxAI, 'getCommand');
    });

    afterEach(() => {
      // Restore the spy after each test
      getCommandSpy.mockRestore();
    });


    it('should execute a directly matched command', async () => {
      const commandMock = {
        name: 'test',
        parse: vi.fn().mockReturnValue({}),
        validate: vi.fn(),
        execute: vi.fn().mockResolvedValue('Test command executed'),
      };
      getCommandSpy.mockReturnValue(commandMock);

      const response = await OnyxAI.routeCommand('test');

      expect(OnyxAI.getCommand).toHaveBeenCalledWith('test');
      expect(commandMock.execute).toHaveBeenCalled();
      expect(response).toEqual(expect.objectContaining({
        type: 'text',
        content: 'Test command executed',
        payload: 'Test command executed',
        metadata: expect.objectContaining({ status: 'success' })
      }));
    });

    it('should fall back to generateContent if no command is found after LLM routing', async () => {
        const intentMock = { command: 'nonExistentCommand', args: {} };
        const getIntentsSpy = vi.spyOn(OnyxAI, 'getIntentsFromLLM').mockResolvedValue(intentMock);

        const generateContentExecute = vi.fn().mockResolvedValue('Fallback response');
        const generateContentCommand = { name: 'generateContent', execute: generateContentExecute, isDefault: true };

        // Setup the spy to return different values on consecutive calls
        getCommandSpy.mockReturnValueOnce(generateContentCommand); // The first check finds the default command
        getCommandSpy.mockReturnValueOnce(undefined); // The second check for 'nonExistentCommand' finds nothing
        getCommandSpy.mockReturnValueOnce(generateContentCommand); // The third check for the fallback finds the command again

        const response = await OnyxAI.routeCommand('some natural language');

        expect(OnyxAI.getIntentsFromLLM).toHaveBeenCalledWith('some natural language');
        expect(getCommandSpy).toHaveBeenCalledWith('nonExistentCommand');
        expect(getCommandSpy).toHaveBeenCalledWith('generateContent');
        expect(generateContentExecute).toHaveBeenCalled();
        expect(response).toEqual(expect.objectContaining({
          type: 'text',
          content: 'Fallback response',
          payload: 'Fallback response',
          metadata: expect.objectContaining({ status: 'success' })
        }));

        getIntentsSpy.mockRestore(); // Clean up the spy
    });


    it('should throw CommandNotFoundError for unknown commands that are not default', async () => {
      getCommandSpy.mockReturnValue(undefined);

      await expect(OnyxAI.routeCommand('unknown')).rejects.toThrow(CommandNotFoundError);
      expect(logger.error).toHaveBeenCalledWith('Error in routeCommand:', expect.any(CommandNotFoundError));
    });

    it('should throw CommandNotFoundError when no command and no default generateContent command is available', async () => {
      // Mock getCommand to always return undefined, simulating both the
      // target command and the 'generateContent' fallback missing.
      getCommandSpy.mockReturnValue(undefined);

      const commandStr = 'some unknown command';
      await expect(OnyxAI.routeCommand(commandStr)).rejects.toThrow(
        new CommandNotFoundError(`The command "${commandStr}" is not recognized and no default command is available.`)
      );

      // Verify getCommand was called twice: once for the input, once for 'generateContent'
      expect(getCommandSpy).toHaveBeenCalledWith(commandStr);
      expect(getCommandSpy).toHaveBeenCalledWith('generateContent');
    });
  });
});
