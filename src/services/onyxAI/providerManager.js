import api from './api';
import config from '../../config';
import logger from '../logging';

/**
 * Manages the selection and availability of LLM providers.
 */
class ProviderManager {
  constructor() {
    this.availableProviders = [];
    this.activeProviderName = 'gemini'; // Default provider

    // Bind methods to ensure 'this' context is always correct
    this.loadProviders = this.loadProviders.bind(this);
    this.getAvailableProviders = this.getAvailableProviders.bind(this);
    this.getActiveProviderName = this.getActiveProviderName.bind(this);
    this.setActiveProvider = this.setActiveProvider.bind(this);
    this.getCurrentProvider = this.getCurrentProvider.bind(this);
    this.getActiveProviderUrl = this.getActiveProviderUrl.bind(this);
  }

  /**
   * Fetches the list of configured providers from the backend.
   */
  async loadProviders() {
    if (config.isMockLlmEnabled) {
      this.availableProviders = ['mock'];
      this.activeProviderName = 'mock';
      return;
    }

    try {
      const providerNames = await api.getAvailableProviderNames();
      if (providerNames && providerNames.length > 0) {
        this.availableProviders = providerNames;
      } else {
        // If no providers are configured, fall back to a default list for UI testing.
        this.availableProviders = ['openai', 'gemini', 'claude', 'deepseek', 'chatbase'];
      }
    } catch (error) {
      logger.error("Failed to load LLM providers, using fallback list:", error);
      // Fallback on any error to ensure UI is testable
      this.availableProviders = ['openai', 'gemini', 'claude', 'deepseek', 'chatbase'];
    }

    const storedProvider = localStorage.getItem('llmProvider');
    if (storedProvider && this.availableProviders.includes(storedProvider)) {
      this.activeProviderName = storedProvider;
    } else if (this.availableProviders.length > 0) {
      this.activeProviderName = this.availableProviders[0];
    }
  }

  /**
   * Gets the list of available provider names.
   * @returns {string[]} A list of provider names.
   */
  getAvailableProviders() {
    return this.availableProviders;
  }

  /**
   * Gets the name of the currently active provider.
   * @returns {string} The active provider name.
   */
  getActiveProviderName() {
    if (config.isMockLlmEnabled) {
      return 'mock';
    }
    return this.activeProviderName;
  }

  /**
   * Sets the active LLM provider and persists it to local storage.
   * @param {string} providerName The name of the provider to set as active.
   */
  setActiveProvider(providerName) {
    if (this.availableProviders.includes(providerName)) {
      this.activeProviderName = providerName;
      localStorage.setItem('llmProvider', providerName);
      logger.info(`LLM Provider set to: ${providerName}`);
    } else {
      logger.warn(`Attempted to set an unavailable provider: ${providerName}`);
    }
  }

  /**
   * Gets the currently active provider and a hardcoded model.
   * @returns {{provider: string, model: string}} An object containing the provider and model.
   */
  getCurrentProvider() {
    // In the future, this could be expanded to allow model selection.
    const provider = this.getActiveProviderName();
    let model;

    switch (provider) {
      case 'openai':
        model = 'gpt-4';
        break;
      case 'gemini':
        model = 'gemini-pro';
        break;
      case 'claude':
        model = 'claude-2';
        break;
      case 'deepseek':
        model = 'deepseek-coder';
        break;
      case 'chatbase':
        model = 'chatbase-v1';
        break;
      default:
        model = 'unknown';
    }

    return { provider, model };
  }

  getActiveProviderUrl() {
    const provider = this.getActiveProviderName();
    // This could be made more robust by storing URLs in a config file
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com';
      case 'claude':
        return 'https://api.anthropic.com';
      case 'deepseek':
          return 'https://api.deepseek.com';
      case 'chatbase':
          return 'https://www.chatbase.co/api/v1/chat';
      default:
        return null;
    }
  }
}

export default new ProviderManager();