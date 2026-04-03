import { describe, it, expect } from 'vitest';
import {
  CommandValidationError,
  ApiKeyError,
  LLMProviderError,
  CommandNotFoundError,
  IntentParsingError,
  DatabaseError,
  CommandExecutionError,
} from '../errors';

describe('OnyxAI Custom Errors', () => {
  const testCases = [
    { ErrorClass: CommandValidationError, name: 'CommandValidationError' },
    { ErrorClass: ApiKeyError, name: 'ApiKeyError' },
    { ErrorClass: LLMProviderError, name: 'LLMProviderError' },
    { ErrorClass: CommandNotFoundError, name: 'CommandNotFoundError' },
    { ErrorClass: IntentParsingError, name: 'IntentParsingError' },
    { ErrorClass: DatabaseError, name: 'DatabaseError' },
    { ErrorClass: CommandExecutionError, name: 'CommandExecutionError' },
  ];

  testCases.forEach(({ ErrorClass, name }) => {
    describe(`${name}`, () => {
      it(`should instantiate with the correct message and name`, () => {
        const message = 'Test error message';
        const error = new ErrorClass(message);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.message).toBe(message);
        expect(error.name).toBe(name);
      });
    });
  });
});
