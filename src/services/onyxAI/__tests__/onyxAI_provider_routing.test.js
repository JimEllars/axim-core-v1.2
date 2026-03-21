import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import onyxAI from '../index';
import * as llm from '../llm';
import conversationHistory from '../memory';
import serviceRegistry from '../serviceRegistry';

// Mock dependencies
vi.mock('../llm', () => ({
  loadProviders: vi.fn(),
  generateContent: vi.fn(),
  generateEmbedding: vi.fn().mockResolvedValue([0,0,0]),
  getCurrentProvider: vi.fn().mockReturnValue({ provider: 'mock', model: 'mock' }),
}));
vi.mock('../memory', () => ({
  default: {
    initialize: vi.fn(),
    addMessage: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  }
}));
vi.mock('../serviceRegistry', () => ({
  default: {
    initialize: vi.fn(),
  }
}));
vi.mock('../api', () => ({
  default: {
    initialize: vi.fn(),
    logAIInteraction: vi.fn().mockResolvedValue(true),
    searchMemory: vi.fn().mockResolvedValue([]),
    searchChatHistory: vi.fn().mockResolvedValue([]),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
  }
}));
vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));
vi.mock('../logging', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    }
}));

describe('OnyxAI Provider Routing', () => {
  let mockApi;
  let mockConnectivityManager;
  let mockOfflineManager;

  beforeEach(async () => {
    llm.getCurrentProvider.mockReturnValue({ provider: 'mock', model: 'mock' });

    mockApi = {
      initialize: vi.fn(),
      logAIInteraction: vi.fn().mockResolvedValue(true),
      searchMemory: vi.fn().mockResolvedValue([]),
    };
    mockConnectivityManager = {
      getIsOnline: vi.fn().mockReturnValue(true),
    };
    mockOfflineManager = {
      queueCommand: vi.fn(),
    };

    await onyxAI.initialize(
      {}, // mock supabase
      'test-user-id',
      {
        api: mockApi,
        connectivityManager: mockConnectivityManager,
        offlineManager: mockOfflineManager
      }
    );
  });

  it('should bypass intent classification and use generateContent when provider is specified', async () => {
    // Setup
    const command = 'Hello AI CTO';
    const options = { provider: 'chatbase', chatbotId: 'cto-123', agentName: 'AI CTO' };

    // Mock generateContent command execution by mocking llm.generateContent
    llm.generateContent.mockResolvedValue('Hello from Chatbase Agent');

    // Spy on getIntentsFromLLM to ensure it is NOT called
    const getIntentsSpy = vi.spyOn(onyxAI, 'getIntentsFromLLM');
    // Spy on _executeLlmCommand to ensure it IS called
    const executeLlmSpy = vi.spyOn(onyxAI, '_executeLlmCommand');

    // Execute
    const result = await onyxAI.routeCommand(command, options);

    // Verify
    expect(executeLlmSpy).toHaveBeenCalled();
    expect(getIntentsSpy).not.toHaveBeenCalled();
    expect(llm.generateContent).toHaveBeenCalledWith(expect.stringContaining(command), expect.objectContaining({
        provider: 'chatbase',
        chatbotId: 'cto-123'
    }));
    expect(result.content).toBe('Hello from Chatbase Agent');
  });

  it('should use intent classification when provider is NOT specified', async () => {
    // Setup
    const command = 'What is the MRR?';

    // Mock intent response (as a stringified JSON because that's what getIntentsFromLLM expects from llm.generateContent)
    const mockIntent = JSON.stringify({ command: 'generateContent', args: {} });

    // We need to mock llm.generateContent to return the intent JSON first, then the content response.
    llm.generateContent
        .mockResolvedValueOnce(mockIntent) // For getIntentsFromLLM
        .mockResolvedValueOnce('MRR is $10k'); // For command execution

    const getIntentsSpy = vi.spyOn(onyxAI, 'getIntentsFromLLM');

    // Execute
    const result = await onyxAI.routeCommand(command);

    // Verify
    expect(getIntentsSpy).toHaveBeenCalledWith(command);
    expect(result.content).toBe('MRR is $10k');
  });
});
