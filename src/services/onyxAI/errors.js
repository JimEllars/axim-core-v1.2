/**
 * @file src/services/onyxAI/errors.js
 * @description Custom error types for the OnyxAI service to allow for more robust error handling.
 */

/**
 * Base class for all custom OnyxAI errors.
 */
export class OnyxAIError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when a command's arguments fail validation.
 * The message is expected to be user-friendly.
 */
export class CommandValidationError extends OnyxAIError {}

/**
 * Thrown when there is an issue with an API key (e.g., missing, invalid).
 */
export class ApiKeyError extends OnyxAIError {}

/**
 * Thrown when the LLM provider fails to return a response.
 * This can be due to network issues, service outages, or invalid requests.
 */
export class LLMProviderError extends OnyxAIError {}

/**
 * Thrown when a command cannot be found or matched.
 */
export class CommandNotFoundError extends OnyxAIError {}

/**
 * Thrown when the LLM's response for intent parsing is invalid or cannot be parsed.
 */
export class IntentParsingError extends OnyxAIError {}

/**
 * Thrown when a database operation fails.
 */
export class DatabaseError extends OnyxAIError {}

/**
 * Thrown when a command fails to execute for a reason not covered by other error types.
 */
export class CommandExecutionError extends OnyxAIError {}

/**
 * Thrown when a method is called but not implemented.
 */
export class NotImplementedError extends OnyxAIError {}
