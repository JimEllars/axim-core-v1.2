import { supabase } from '../supabaseClient';
import config from '../../config';
import providerManager from './providerManager';
import { ApiKeyError, LLMProviderError } from './errors';
import logger from '../logging';

/**
 * Generates a mock response for development and testing purposes.
 * @param {string} prompt The input prompt.
 * @returns {Promise<string>} A promise that resolves with a mock response.
 */
async function getMockLlmResponse(prompt) {
  return new Promise(resolve => {
    setTimeout(() => {
      const response = `This is a mock response for the prompt: "${prompt}". The mock LLM is currently enabled.`;
      resolve(response);
    }, 500);
  });
}

/**
 * Generates an embedding for the given input text.
 * @param {string} input The text to embed.
 * @returns {Promise<number[]>} A promise that resolves with the embedding vector.
 */
export const generateEmbedding = async (input) => {
  if (config.isMockLlmEnabled) {
    return Array(1536).fill(0);
  }

  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  try {
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: { input },
    });

    if (error) {
      throw new Error(`Embedding Generation Error: ${error.message}`);
    }

    if (data.error) {
      throw new Error(`Embedding Generation Error: ${data.error}`);
    }

    return data.embedding;
  } catch (error) {
    logger.error("Failed to generate embedding.", error);
    throw error;
  }
};

export const generateContent = async (prompt, options = {}) => {
  if (config.isMockLlmEnabled) {
    return getMockLlmResponse(prompt);
  }

  const availableProviders = providerManager.getAvailableProviders();
  let activeProviderName = providerManager.getActiveProviderName();

  if (!activeProviderName || !availableProviders.length) {
    throw new LLMProviderError("No LLM providers available. Please configure providers in the admin settings.");
  }

  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  let providerQueue;
  if (options.provider) {
    providerQueue = [options.provider];
  } else {
    providerQueue = [
      activeProviderName,
      ...availableProviders.filter(p => p !== activeProviderName)
    ];
  }

  if (providerQueue.length === 1) {
    const provider = providerQueue[0];
    try {
      const { data, error } = await supabase.functions.invoke('llm-proxy', {
        body: { provider, prompt, options },
      });

      if (error) {
        throw new Error(`LLM Proxy Invocation Error: ${error.message}`);
      }

      if (data.error) {
        if (typeof data.error === 'string' && data.error.toLowerCase().includes('api key')) {
          throw new ApiKeyError(data.error);
        }
        throw new Error(data.error);
      }

      if (provider !== activeProviderName) {
        providerManager.setActiveProvider(provider);
      }
      return data.content;
    } catch (error) {
      let isApiKeyError = error instanceof ApiKeyError;
      if (!isApiKeyError && error.message && error.message.toLowerCase().includes('api key')) {
        isApiKeyError = true;
      }

      const message = error.message; // Preserve original error message format from test

      logger.error("All LLM providers failed.", error);
      throw new LLMProviderError(`Failed to get a response from any AI provider. Last error: ${message}`);
    }
  }

  // Use Promise.any for multiple providers
  const promises = providerQueue.map(async (provider) => {
    try {
      const { data, error } = await supabase.functions.invoke('llm-proxy', {
        body: { provider, prompt, options },
      });

      if (error) {
        throw new Error(`LLM Proxy Invocation Error: ${error.message}`);
      }

      if (data.error) {
        if (typeof data.error === 'string' && data.error.toLowerCase().includes('api key')) {
          throw new ApiKeyError(data.error);
        }
        throw new Error(data.error);
      }

      return { provider, content: data.content };
    } catch (e) {
      logger.warn(`Provider ${provider} failed: ${e.message}. `);
      throw e;
    }
  });

  try {
    const successResult = await Promise.any(promises);

    if (successResult.provider !== activeProviderName) {
      providerManager.setActiveProvider(successResult.provider);
    }
    return successResult.content;
  } catch (aggregateError) {
    const errors = aggregateError.errors;
    let lastError = errors[errors.length - 1];

    // Check if any error was an ApiKeyError or contained "api key"
    const apiKeyError = errors.find(e => e instanceof ApiKeyError || (e.message && e.message.toLowerCase().includes('api key')));

    const errorMessage = apiKeyError ? apiKeyError.message : lastError.message;

    logger.error("All LLM providers failed.", lastError);
    throw new LLMProviderError(`Failed to get a response from any AI provider. Last error: ${errorMessage}`);
  }
};

export const {
  loadProviders,
  getAvailableProviders,
  getActiveProviderName,
  setActiveProvider,
  getCurrentProvider,
  getActiveProviderUrl
} = providerManager;
