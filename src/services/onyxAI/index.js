import toast from 'react-hot-toast';
import { findCommand } from './commandRouter';
import { sanitizeInput } from './utils';
import conversationHistory from './memory';
import serviceRegistry from './serviceRegistry';
import commands from './commands';
import * as llm from './llm';
import { CommandNotFoundError, IntentParsingError, CommandExecutionError } from './errors';
import logger from '../logging';

/**
 * The core class for the Onyx AI, responsible for command routing,
 * execution, and interaction with the LLM.
 */
class OnyxAI {
  constructor() {
    this.name = "Onyx";
    this.version = "1.2.0";
    this.isInitialized = false;
    this.conversationId = crypto.randomUUID();
    this.userId = null;
    this.api = null; // To be injected
    this.connectivityManager = null; // To be injected
    this.offlineManager = null; // To be injected
  }

  /**
   * Initializes the AI service with a Supabase client and loads providers.
   * @param {object} supabase The Supabase client instance.
   * @param {string} userId The authenticated user's ID.
   * @param {object} dependencies The dependencies to inject.
   */
  async initialize(supabase, userId, dependencies) {
    // Reset state for re-initialization in tests or other scenarios.
    this.isInitialized = false;

    try {
      this.api = dependencies.api;
      this.connectivityManager = dependencies.connectivityManager;
      this.offlineManager = dependencies.offlineManager;

      this.api.initialize(supabase, this.connectivityManager, this.offlineManager);
      this.userId = userId;

      // Use Promise.all to handle multiple async setup tasks concurrently.
      await Promise.all([
        llm.loadProviders(),
        conversationHistory.initialize(this.userId, this.conversationId),
        serviceRegistry.initialize()
      ]);

      this.isInitialized = true;
      toast.success("OnyxAI is online.", { id: 'onyx-online' });
    } catch (error) {
      this.isInitialized = false; // Ensure this is set to false on failure.
      logger.error('OnyxAI initialization failed:', error);
      toast.error("OnyxAI failed to initialize and is offline.", { id: 'onyx-offline' });
    }
  }

  /**
   * Clears the current conversation history and starts a new conversation.
   */
  clearConversationHistory() {
    conversationHistory.clear();
    this.conversationId = crypto.randomUUID(); // Start a new conversation stream
  }

  getCommand(command) {
    return findCommand(command);
  }

  getCommands() {
    return commands;
  }

  async confirm(question) {
    // This is a placeholder. A real implementation would involve a UI prompt.
    return new Promise((resolve) => {
        // For now, we'll just resolve to true for testing purposes.
        resolve(true);
    });
  }

  /**
   * Routes a command to the appropriate handler, logs the full interaction,
   * and persists it to the database.
   * @param {string} command The user's command string.
   * @param {object} options Optional parameters.
   * @param {boolean} options.isOfflineSync - Flag to prevent re-queueing during offline sync.
   * @returns {Promise<string>} The response from the executed command.
   */
  async routeCommand(command, options = {}) {
    const { isOfflineSync = false } = options;
    const sanitizedCommand = sanitizeInput(command);

    if (!isOfflineSync && !this.connectivityManager.getIsOnline()) {
      this.offlineManager.queueCommand(sanitizedCommand);
      const offlineResponse = "You are currently offline. Your command has been queued and will be executed when you're back online.";
      conversationHistory.addMessage('assistant', offlineResponse);
      toast.info(offlineResponse, { id: 'offline-queue' });
      return {
        type: 'text',
        content: offlineResponse,
        payload: offlineResponse,
        metadata: {
          agentName: options.agentName || 'Onyx AI',
          status: 'queued',
          timestamp: Date.now()
        }
      };
    }

    const startTime = Date.now();
    let response;
    let status = 'success';
    let commandType;
    let llmProvider;
    let llmModel;

    // Add user message to history so it's available for context in future turns.
    conversationHistory.addMessage('user', sanitizedCommand);

    try {
      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch (e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj || commandObj.name !== 'generateContent') {
        try {
          commandObj = this.getCommand('generateContent');
        } catch (e) {
           commandObj = { name: 'generateContent', isDefault: true };
        }
        if (!commandObj) {
            // This is a safeguard. It should not be reached if 'generateContent' is always defined.
            throw new CommandNotFoundError(`The command "${sanitizedCommand}" is not recognized and no default command is available.`);
        }
      }

      commandType = commandObj.isDefault ? 'llm' : 'direct';

      if (commandType === 'llm') {
        const providerInfo = llm.getCurrentProvider();
        llmProvider = providerInfo.provider;
        llmModel = providerInfo.model;
        response = await this._executeLlmCommand(sanitizedCommand, options);
      } else {
        response = await this._executeDirectCommand(commandObj, sanitizedCommand, options);
      }

      // Create structured response
      const structuredResponse = {
        type: (typeof response === 'object' && response !== null && response.type) ? response.type : 'text',
        content: (typeof response === 'object' && response !== null && response.content) ? response.content : response,
        payload: response,
        metadata: {
          agentName: options.agentName || 'Onyx AI',
          provider: llmProvider,
          model: llmModel,
          commandType,
          timestamp: Date.now(),
          status
        }
      };

      conversationHistory.addMessage('assistant', response);
      return structuredResponse;

    } catch (error) {
      status = 'failed';
      let errorMessage;

      switch (error.name) {
        case 'CommandNotFoundError':
          errorMessage = { title: 'Command Not Found', details: `The command "${sanitizedCommand}" is not recognized. Try "help" to see a list of available commands.` };
          break;
        case 'ValidationError':
          errorMessage = { title: 'Invalid Command Format', details: error.message };
          break;
        case 'IntentParsingError':
           errorMessage = { title: 'AI Intent Parsing Error', details: "The AI failed to understand the command. Please try rephrasing it." };
          break;
        default:
          errorMessage = { title: 'An Unexpected Error Occurred', details: error.message };
      }

      toast.error(`${errorMessage.title}: ${errorMessage.details}`);
      conversationHistory.addMessage('error', errorMessage);
      response = errorMessage; // Store the object, not the stringified version
      logger.error('Error in routeCommand:', error);
      throw error;

    } finally {
      const executionTime = Date.now() - startTime;
      const responseToLog = typeof response === 'object' ? JSON.stringify(response) : response;

      let embedding = null;
      try {
        const { generateEmbedding } = await import('./llm');
        embedding = await generateEmbedding(sanitizedCommand);
      } catch (err) {
        logger.warn('Failed to generate embedding for AI interaction:', err);
      }

      try {
        await this.api.logAIInteraction(sanitizedCommand, responseToLog, executionTime, status, this.userId, this.conversationId, commandType, llmProvider, llmModel, embedding);
      } catch(e) {
        logger.error("FATAL: Failed to log AI interaction to database.", e);
        toast.error("Failed to save conversation to database.");
      }
    }
  }

  /**
   * Executes a command that was directly matched.
   * @private
   */
  async _executeDirectCommand(commandObj, sanitizedCommand, options = {}) {
    const args = commandObj.parse(sanitizedCommand, commandObj.extractedEntities);
    commandObj.validate(args);

    if (commandObj.requires_approval) {
      try {
        await this.api.logHitlAction(this.userId, commandObj.name, JSON.stringify({ ...args, description: `Command: ${commandObj.name}`, target: args.email || args.source || args.serviceName || args.person || 'General' }));
        return {
          type: 'text',
          content: "This action requires human approval. It has been added to the Human-in-the-Loop queue.",
          status: 'queued_for_approval'
        };
      } catch (err) {
        logger.error("Failed to log HITL action:", err);
      }
    }

    const context = {
      aximCore: this,
      conversationHistory: conversationHistory.getHistory(),
      userId: this.userId,
      allCommands: commands,
      options,
    };
    const result = await commandObj.execute(args, context);
    return typeof result === 'string' ? result : result;
  }

  /**
   * Executes a command by first routing it through the LLM for intent detection.
   * @private
   */
  async _executeLlmCommand(sanitizedCommand, options = {}) {
    // If a specific provider is requested (e.g. Chatbase agent), bypass intent classification
    // and route directly to the content generation command to ensure the specific agent handles it.
    if (options.provider) {
      const commandObj = this.getCommand('generateContent');
      const context = {
        aximCore: this,
        conversationHistory: conversationHistory.getHistory(),
        userId: this.userId,
        allCommands: commands,
        options,
      };
      return await commandObj.execute(sanitizedCommand, context);
    }

    const intent = await this.getIntentsFromLLM(sanitizedCommand);
    let commandObj;
    try {
      commandObj = this.getCommand(intent.command);
    } catch (err) {
      commandObj = null;
    }

    if (!commandObj) {
      // toast(`Unknown command: "${intent.command}". Switching to content generation.`);
      commandObj = this.getCommand('generateContent');
    }

    const context = {
      aximCore: this,
      conversationHistory: conversationHistory.getHistory(),
      userId: this.userId,
      allCommands: commands,
      options,
    };

    if (commandObj.name !== 'generateContent') {
      const args = commandObj.parse(sanitizedCommand, intent.args);
      commandObj.validate(args);
      const result = await commandObj.execute(args, context);
      return typeof result === 'string' ? result : result;
    }

    return await commandObj.execute(sanitizedCommand, context);
  }

  /**
   * Uses an LLM to determine the user's intent from a natural language command.
   * This is the fallback when a command doesn't match any predefined keywords.
   * @param {string} command The user's command string.
   * @returns {Promise<object>} An object containing the identified command and its arguments.
   * @private
   */
  async getIntentsFromLLM(command) {
    const availableCommands = commands
      .filter(cmd => !cmd.isDefault)
      .map(cmd => ({
        command: cmd.name,
        description: cmd.description,
        args: cmd.entities.reduce((acc, entity) => {
          acc[entity.name] = entity.example || '...';
          return acc;
        }, {}),
      }));

    const prompt = `
      Analyze the user's command: "${command}"

      Your task is to select the best command from the available commands list and extract any necessary arguments.

      Available Commands:
      ${JSON.stringify(availableCommands, null, 2)}

      Respond with a single, valid JSON object in the format: {"command": "command_name", "args": {...}}.

      - For general questions, creative tasks, or commands not on the list, use the "generateContent" command.
      - If you cannot determine the intent, default to "generateContent".
    `;

    let result;
    try {
      result = await llm.generateContent(prompt, { max_tokens: 250, json: true });
      return JSON.parse(result);
    } catch (error) {
       // Log the original error for debugging, regardless of its type.
       logger.error("An error occurred in getIntentsFromLLM.", error, { response: result });

       // Check if the error is a JSON parsing error and, if so, wrap it.
       // This ensures that downstream consumers get the specific error type they expect.
      if (error instanceof SyntaxError) {
        throw new IntentParsingError("The AI returned a response in an invalid format.");
      }

      // Re-throw custom errors if they are already the correct type.
      if (error instanceof IntentParsingError || error instanceof CommandExecutionError) {
        throw error;
      }

      // For any other type of error (e.g., network failure from the LLM call),
      // wrap it in a generic execution error.
      throw new CommandExecutionError(`An unexpected error occurred while communicating with the AI: ${error.message}`);
    }
  }
}

const onyxAI = new OnyxAI();
export default onyxAI;
