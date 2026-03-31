// src/services/onyxAI/commands/commandFactory.js

/**
 * Creates a command object with a consistent structure and validation.
 * @param {object} definition The command definition object.
 * @returns {object} The validated command object.
 */
import { CommandValidationError } from '../errors';

export const createCommand = (definition) => {
  const baseCommand = {
    aliases: [],
    entities: [],
    isDefault: false,
    /**
     * A default parser function that leverages the structured entities from the NLP service.
     * Can be overridden by the command definition for more complex, non-standard parsing.
     * @param {string} input The user's input string.
     * @param {object} extractedEntities A map of entities extracted by the NLP service.
     * @returns {object} The parsed arguments, which are the extracted entities.
     */
    parse: (input, extractedEntities = {}) => {
      return extractedEntities;
    },
    /**
     * Validates the arguments for the command.
     * Throws an error if validation fails.
     * @param {object} args The arguments to validate.
     */
    validate: (args) => {
      if (!args) {
        throw new CommandValidationError('Arguments must be provided to the command.');
      }

      for (const entity of baseCommand.entities) {
        // Handle entities defined as simple strings (e.g., 'EMAIL') or objects ({ name: 'EMAIL', required: true })
        const entityName = typeof entity === 'string' ? entity : entity.name;
        const isRequired = typeof entity === 'object' && entity.required;

        if (isRequired && (args[entityName] === undefined || args[entityName] === null)) {
          throw new CommandValidationError(`Missing required argument: "${entityName}". ${entity.prompt || ''}`);
        }
      }
    },
  };

  const command = { ...baseCommand, ...definition };

  // Re-bind entity access for the default parse/validate functions after merging.
  baseCommand.entities = command.entities;

  if (!command.name || !command.description || !command.keywords || !command.execute) {
    throw new Error(`Command definition for "${command.name}" is missing required fields.`);
  }

  return command;
};
