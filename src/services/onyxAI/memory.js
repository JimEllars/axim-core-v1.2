// src/services/onyxAI/memory.js
import toast from 'react-hot-toast';
import api from './api';
import logger from '../logging';
import { supabase } from '../supabaseClient';

const LOCAL_STORAGE_KEY_PREFIX = 'axim_chat_history_';
const AUTOSAVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Manages the local and remote conversation history.
 * This class provides an optimistic UI update by caching messages in localStorage,
 * while ensuring eventual consistency with the backend database.
 */
class ConversationHistory {
  constructor() {
    this.history = [];
    this.userId = null;
    this.conversationId = null;
    this.storageKey = null;
    this.autosaveInterval = null;
    this.summaryThreshold = 15;
    this.summaryCount = 10;
  }

  /**
   * Initializes the service with user and conversation details and loads history.
   * @param {string} userId The authenticated user's ID.
   * @param {string} conversationId The unique ID for the current conversation.
   */
  async initialize(userId, conversationId) {
    if (this.userId === userId && this.conversationId === conversationId) {
      return; // Already initialized for this conversation
    }
    if (!userId || !conversationId) {
      logger.warn('ConversationHistory initialization requires userId and conversationId.');
      return;
    }

    this.userId = userId;
    this.conversationId = conversationId;
    this.storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${this.conversationId}`;

    this._stopAutosave(); // Stop any previous interval
    this.history = []; // Clear previous history

    // 1. Load from local storage for an immediate UI update.
    this._loadFromCache();

    try {
      // 2. Fetch authoritative history from the backend.
      const interactions = await api.getChatHistoryForUser(userId, conversationId);
      const remoteHistory = this._formatInteractions(interactions);

      // 3. Merge local and remote history, preferring remote data.
      this._mergeAndCache(remoteHistory);
    } catch (error) {
      logger.error('Failed to load remote conversation history:', error);
      toast.error('Could not load full chat history. Displaying cached messages.');
    }

    // 4. Start the periodic autosave.
    this._startAutosave();
  }

  /**
   * Adds a message to the history, enriching it with metadata.
   * @param {string} type - The type of message ('user', 'assistant', 'error', 'system').
   * @param {string|object} content - The message content.
   */
  async addMessage(type, content) {
    const message = {
      messageId: crypto.randomUUID(),
      conversationId: this.conversationId,
      userId: this.userId,
      type,
      content,
      timestamp: new Date().toISOString(),
    };
    this.history.push(message);
    this._saveToCache();

    // Check for rolling summary
    await this._checkAndPerformRollingSummary();
  }

  getHistory() {
    return this.history;
  }

  /**
   * Clears the conversation history from memory and the local cache.
   */
  clear() {
    this.history = [];
    this.userId = null;
    this.conversationId = null;

    this._stopAutosave(); // Stop the autosave interval

    if (this.storageKey) {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        logger.error('Failed to clear conversation history from localStorage:', error);
      }
    }
    this.storageKey = null;
  }

  // --- Private Helper Methods ---

  async _checkAndPerformRollingSummary() {
      // Filter out system messages/summaries from the threshold count
      const userAndAssistantMessages = this.history.filter(msg => msg.type === 'user' || msg.type === 'assistant');

      if (userAndAssistantMessages.length > this.summaryThreshold) {
          logger.info(`Message count (${userAndAssistantMessages.length}) exceeded threshold. Triggering rolling summary.`);

          // Identify the oldest N messages
          const oldestMessages = userAndAssistantMessages.slice(0, this.summaryCount);
          const messagesToSummarize = oldestMessages.map(m => `${m.type}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');

          try {
              // In a real application, you might use an edge function to do this summarization
              // Here we simulate the LLM call using the api proxy or direct instruction
              const summaryPrompt = `Please provide a dense, concise summary of the following conversation history. Preserve key facts and intent.\n\n${messagesToSummarize}`;

              const { data, error } = await supabase.functions.invoke('llm-proxy', {
                  body: {
                      messages: [{ role: 'system', content: summaryPrompt }],
                      model: 'claude-3-haiku-20240307' // Fast model
                  }
              });

              if (error) throw error;

              const summaryText = data?.content || data?.choices?.[0]?.message?.content || "Summary could not be generated.";

              // 1. Create the summary message
              const summaryMessage = {
                  messageId: crypto.randomUUID(),
                  conversationId: this.conversationId,
                  userId: this.userId,
                  type: 'system',
                  content: `[System Memory Summary]: ${summaryText}`,
                  timestamp: new Date().toISOString(),
              };

              // 2. Remove the oldest N messages from local history
              const idsToRemove = new Set(oldestMessages.map(m => m.messageId));
              this.history = this.history.filter(m => !idsToRemove.has(m.messageId));

              // 3. Add the summary message at the beginning of the local history (after any existing summaries)
              let insertIndex = 0;
              while(insertIndex < this.history.length && this.history[insertIndex].type === 'system') {
                  insertIndex++;
              }
              this.history.splice(insertIndex, 0, summaryMessage);

              this._saveToCache();

              // 4. Save to MemoryBank (RAG)
              await supabase.from('ai_memory_banks').insert({
                  user_id: this.userId,
                  content: summaryText,
                  source_type: 'rolling_summary',
                  metadata: { conversationId: this.conversationId }
              });

              logger.info('Rolling summary complete and stored in Memory Bank.');
          } catch (err) {
              logger.error('Error during rolling summary generation:', err);
          }
      }
  }

  _startAutosave() {
    this._stopAutosave(); // Ensure no duplicate intervals are running
    this.autosaveInterval = setInterval(() => {
      if (this.history.length > 0) {
        logger.info(`[Autosave] Saving conversation history for ${this.conversationId}`);
        this._saveToCache();
      }
    }, AUTOSAVE_INTERVAL);
  }

  _stopAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  _loadFromCache() {
    if (!this.storageKey) return;
    try {
      const cachedHistory = localStorage.getItem(this.storageKey);
      if (cachedHistory) {
        this.history = JSON.parse(cachedHistory);
        logger.info(`Loaded ${this.history.length} messages from cache for conversation ${this.conversationId}`);
      }
    } catch (error) {
      logger.error('Failed to load conversation history from cache:', error);
      this.history = [];
    }
  }

  _saveToCache() {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    } catch (error) {
      logger.error('Failed to save conversation history to cache:', error);
    }
  }

  _formatInteractions(interactions) {
    if (!interactions) return [];
    return interactions.flatMap(log => {
      const messages = [];
      const baseMessage = {
        conversationId: this.conversationId,
        userId: this.userId,
        timestamp: log.created_at,
      };
      if (log.command) {
        messages.push({ ...baseMessage, messageId: `${log.id}-user`, type: 'user', content: log.command });
      }
      if (log.response) {
        const type = log.status === 'failed' ? 'error' : 'assistant';
        let content = log.response;
        try {
          content = JSON.parse(content);
        } catch (e) { /* Not JSON, leave as is */ }
        messages.push({ ...baseMessage, messageId: `${log.id}-asst`, type, content });
      }
      return messages;
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  _mergeAndCache(remoteHistory) {
    if (remoteHistory.length === 0) {
      // No remote history, so the local cache is the best we have.
      return;
    }

    const messageMap = new Map();

    // Add remote messages first, as they are the source of truth.
    remoteHistory.forEach(msg => messageMap.set(msg.messageId, msg));

    // Add local messages only if they haven't been added already.
    // This prevents duplicates and preserves optimistic UI updates.
    this.history.forEach(msg => {
      if (!messageMap.has(msg.messageId)) {
        messageMap.set(msg.messageId, msg);
      }
    });

    // Sort the combined history by timestamp to ensure correct order.
    this.history = Array.from(messageMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    this._saveToCache();
    logger.info(`Merged local and remote history. Total messages: ${this.history.length}`);
  }
}

export default new ConversationHistory();
