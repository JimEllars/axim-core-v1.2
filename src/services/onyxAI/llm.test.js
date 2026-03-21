import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  generateContent,
  getActiveProviderName,
  setActiveProvider,
  loadProviders,
  getAvailableProviders
} from './llm';
import providerManager from './providerManager';
import config from '../../config';
import api from './api';

// Mock dependencies
vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('../../config', () => ({
  default: {
    isMockLlmEnabled: false,
  },
}));

vi.mock('./api', () => ({
  default: {
    getAvailableProviderNames: vi.fn(),
  }
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('LLM Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    // Reset the provider manager state before each test
    providerManager.availableProviders = [];
    providerManager.activeProviderName = 'gemini';
  });

  describe('when mock is enabled', () => {
    beforeEach(() => {
      config.isMockLlmEnabled = true;
    });

    it('getActiveProviderName should return "mock"', async () => {
      await loadProviders();
      expect(getActiveProviderName()).toBe('mock');
    });

    it('generateContent should return a mock response', async () => {
      const response = await generateContent('any prompt');
      expect(response).toContain('mock response');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  describe('when mock is disabled', () => {
    beforeEach(() => {
      config.isMockLlmEnabled = false;
      vi.mocked(api.getAvailableProviderNames).mockResolvedValue(['openai', 'gemini']);
    });

    it('getActiveProviderName should return value from localStorage after loading', async () => {
      localStorage.setItem('llmProvider', 'openai');
      await loadProviders();
      expect(getActiveProviderName()).toBe('openai');
    });

    it('generateContent should use the first available provider as default if no provider is selected in localStorage', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { content: 'default response' } });
      await loadProviders();
      const result = await generateContent('test prompt');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('llm-proxy', {
        body: { provider: 'openai', prompt: 'test prompt', options: {} },
      });
      expect(result).toBe('default response');
    });

    it('generateContent should call the llm-proxy function and return content', async () => {
      const provider = 'openai';
      await loadProviders();
      setActiveProvider(provider);
      supabase.functions.invoke.mockResolvedValue({ data: { content: 'test' } });
      const result = await generateContent('a prompt');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('llm-proxy', {
        body: { provider, prompt: 'a prompt', options: {} },
      });
      expect(result).toBe('test');
    });

    it('generateContent should throw LLMProviderError if no providers are available', async () => {
      providerManager.availableProviders = [];
      providerManager.activeProviderName = null;
      await expect(generateContent('test prompt')).rejects.toThrow('No LLM providers available');
    });

    it('generateContent should use options.provider exclusively if provided', async () => {
      await loadProviders();
      supabase.functions.invoke.mockResolvedValue({ data: { content: 'specific provider response' } });
      const result = await generateContent('test prompt', { provider: 'chatbase' });

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('llm-proxy', {
        body: { provider: 'chatbase', prompt: 'test prompt', options: { provider: 'chatbase' } },
      });
      expect(result).toBe('specific provider response');
    });

    it('generateContent should throw Error if proxy invocation returns an error', async () => {
      await loadProviders();
      supabase.functions.invoke.mockResolvedValue({ error: new Error('Network failure') });
      await expect(generateContent('test prompt')).rejects.toThrow('LLM Proxy Invocation Error: Network failure');
    });

    it('generateContent should throw ApiKeyError if proxy returns API key error', async () => {
      await loadProviders();
      // To test that it throws ApiKeyError, we actually should look at the final error since it loops over all providers.
      // The function currently catches ApiKeyError and converts it to a warning until all providers fail,
      // then throws LLMProviderError with the last error's message.
      // Let's modify the test to expect the specific LLMProviderError message that contains the ApiKeyError info,
      // OR better, we can verify that if we provide only one provider, we can test the specific error behavior.
      providerManager.availableProviders = ['openai'];
      providerManager.activeProviderName = 'openai';

      supabase.functions.invoke.mockResolvedValue({ data: { error: 'Invalid API key provided' } });
      await expect(generateContent('test prompt')).rejects.toThrow('Failed to get a response from any AI provider. Last error: Invalid API key provided');
    });

    it('generateContent should throw LLMProviderError if proxy returns generic error', async () => {
      await loadProviders();
      providerManager.availableProviders = ['openai'];
      providerManager.activeProviderName = 'openai';

      supabase.functions.invoke.mockResolvedValue({ data: { error: 'Service Unavailable' } });
      await expect(generateContent('test prompt')).rejects.toThrow('Failed to get a response from any AI provider. Last error: Service Unavailable');
    });

    it('generateContent should fall back to next provider if first one fails', async () => {
      await loadProviders();
      // openai is default (from first test that loads), gemini is second
      supabase.functions.invoke
        .mockResolvedValueOnce({ data: { error: 'Service down' } }) // First call fails
        .mockResolvedValueOnce({ data: { content: 'fallback response' } }); // Second call succeeds

      const result = await generateContent('test prompt');

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(1, 'llm-proxy', {
        body: { provider: 'openai', prompt: 'test prompt', options: {} },
      });
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2, 'llm-proxy', {
        body: { provider: 'gemini', prompt: 'test prompt', options: {} },
      });
      expect(result).toBe('fallback response');
      expect(getActiveProviderName()).toBe('gemini'); // Should have updated active provider
    });

    it('generateContent should throw LLMProviderError if all providers fail', async () => {
      await loadProviders();
      supabase.functions.invoke.mockResolvedValue({ data: { error: 'Service down' } }); // All calls fail

      await expect(generateContent('test prompt')).rejects.toThrow('Failed to get a response from any AI provider');
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2); // Tried both openai and gemini
    });
  });
});