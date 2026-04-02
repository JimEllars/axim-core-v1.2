import { describe, it, expect, vi } from 'vitest';
import { createCommand } from '../commandFactory';
import { CommandValidationError } from '../../errors';

describe('createCommand', () => {
  it('should create a valid command with default properties', () => {
    const executeMock = vi.fn();
    const definition = {
      name: 'testCommand',
      description: 'A test command',
      keywords: ['test'],
      execute: executeMock,
    };

    const command = createCommand(definition);

    expect(command).toBeDefined();
    expect(command.name).toBe('testCommand');
    expect(command.description).toBe('A test command');
    expect(command.keywords).toEqual(['test']);
    expect(command.execute).toBe(executeMock);

    // Default properties
    expect(command.aliases).toEqual([]);
    expect(command.entities).toEqual([]);
    expect(command.isDefault).toBe(false);
    expect(typeof command.parse).toBe('function');
    expect(typeof command.validate).toBe('function');

    // Structural properties
    expect(command).toHaveProperty('name');
    expect(command).toHaveProperty('description');
    expect(command).toHaveProperty('keywords');
    expect(command).toHaveProperty('execute');
    expect(command).toHaveProperty('aliases');
    expect(command).toHaveProperty('entities');
    expect(command).toHaveProperty('isDefault');
    expect(command).toHaveProperty('parse');
    expect(command).toHaveProperty('validate');
  });

  it('should throw an error if a required field is missing', () => {
    const invalidDefinitions = [
      { description: 'missing name', keywords: ['test'], execute: vi.fn() },
      { name: 'test', keywords: ['test'], execute: vi.fn() }, // missing description
      { name: 'test', description: 'test', execute: vi.fn() }, // missing keywords
      { name: 'test', description: 'test', keywords: ['test'] }, // missing execute
    ];

    invalidDefinitions.forEach((def) => {
      expect(() => createCommand(def)).toThrowError(/Command definition for ".*" is missing required fields./);
    });
  });

  describe('default parse function', () => {
    it('should return the extractedEntities as the parsed arguments', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
      };
      const command = createCommand(definition);

      const extractedEntities = { target: 'user', action: 'create' };
      const parsedArgs = command.parse('some input string', extractedEntities);

      expect(parsedArgs).toEqual(extractedEntities);
    });

    it('should handle undefined extractedEntities', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
      };
      const command = createCommand(definition);

      const parsedArgs = command.parse('some input string');

      expect(parsedArgs).toEqual({});
    });
  });

  describe('default validate function', () => {
    it('should not throw if no entities are required', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: ['OPTIONAL_ARG', { name: 'ANOTHER_OPTIONAL', required: false }],
      };
      const command = createCommand(definition);

      expect(() => command.validate({})).not.toThrow();
    });

    it('should throw CommandValidationError if a required entity object is missing', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: [
          { name: 'REQUIRED_ARG', required: true, prompt: 'Please provide REQUIRED_ARG' }
        ],
      };
      const command = createCommand(definition);

      expect(() => command.validate({})).toThrowError(CommandValidationError);
      expect(() => command.validate({})).toThrowError(/Missing required argument: "REQUIRED_ARG". Please provide REQUIRED_ARG/);
    });

    it('should throw CommandValidationError without a prompt if prompt is not provided', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: [
          { name: 'REQUIRED_ARG', required: true }
        ],
      };
      const command = createCommand(definition);

      expect(() => command.validate({})).toThrowError(CommandValidationError);
      expect(() => command.validate({})).toThrowError('Missing required argument: "REQUIRED_ARG". ');
    });

    it('should not throw if a required entity object is provided', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: [
          { name: 'REQUIRED_ARG', required: true }
        ],
      };
      const command = createCommand(definition);

      expect(() => command.validate({ REQUIRED_ARG: 'some value' })).not.toThrow();
    });

    it('should not throw if a required entity object is provided with a falsy but present value', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: [
          { name: 'REQUIRED_ARG', required: true }
        ],
      };
      const command = createCommand(definition);

      expect(() => command.validate({ REQUIRED_ARG: 0 })).not.toThrow();
      expect(() => command.validate({ REQUIRED_ARG: false })).not.toThrow();
      expect(() => command.validate({ REQUIRED_ARG: '' })).not.toThrow();
    });

    it('should throw CommandValidationError when validate is called with null or undefined', () => {
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: [
          { name: 'REQUIRED_ARG', required: true }
        ],
      };
      const command = createCommand(definition);

      expect(() => command.validate()).toThrowError(CommandValidationError);
      expect(() => command.validate(null)).toThrowError(CommandValidationError);
    });

    it('should handle string entity definitions correctly', () => {
      // String entity definitions are treated as optional in the current implementation
      const definition = {
        name: 'testCommand',
        description: 'test',
        keywords: ['test'],
        execute: vi.fn(),
        entities: ['STRING_ARG'],
      };
      const command = createCommand(definition);

      expect(() => command.validate({})).not.toThrow(); // Should not throw since it's not explicitly required
    });

    it('should not leak entities between different command instances', () => {
      const command1 = createCommand({
        name: 'cmd1', description: 'cmd1', keywords: ['1'], execute: vi.fn(),
        entities: [{ name: 'ARG1', required: true }]
      });
      const command2 = createCommand({
        name: 'cmd2', description: 'cmd2', keywords: ['2'], execute: vi.fn(),
        entities: [{ name: 'ARG2', required: true }]
      });

      expect(() => command1.validate({ ARG1: 'val' })).not.toThrow();
      expect(() => command2.validate({ ARG2: 'val' })).not.toThrow();

      expect(() => command1.validate({ ARG2: 'val' })).toThrow(CommandValidationError);
      expect(() => command2.validate({ ARG1: 'val' })).toThrow(CommandValidationError);
    });

    it('should not throw if the required value is the number 0', () => {
      const definition = {
        name: 'cmd', description: 'desc', keywords: ['key'], execute: vi.fn(),
        entities: [{ name: 'NUM', required: true }]
      };
      const command = createCommand(definition);
      expect(() => command.validate({ NUM: 0 })).not.toThrow();
    });

    it('should not throw if the required value is false', () => {
      const definition = {
        name: 'cmd', description: 'desc', keywords: ['key'], execute: vi.fn(),
        entities: [{ name: 'BOOL', required: true }]
      };
      const command = createCommand(definition);
      expect(() => command.validate({ BOOL: false })).not.toThrow();
    });

    it('should not throw if the required value is an empty string', () => {
      const definition = {
        name: 'cmd', description: 'desc', keywords: ['key'], execute: vi.fn(),
        entities: [{ name: 'STR', required: true }]
      };
      const command = createCommand(definition);
      expect(() => command.validate({ STR: '' })).not.toThrow();
    });
  });

  it('should allow overriding default functions', () => {
    const customParse = vi.fn().mockReturnValue({ custom: 'args' });
    const customValidate = vi.fn();

    const definition = {
      name: 'testCommand',
      description: 'test',
      keywords: ['test'],
      execute: vi.fn(),
      parse: customParse,
      validate: customValidate,
    };

    const command = createCommand(definition);

    const parsedArgs = command.parse('input', { entity: 'value' });
    expect(parsedArgs).toEqual({ custom: 'args' });
    expect(customParse).toHaveBeenCalledWith('input', { entity: 'value' });

    command.validate({ some: 'args' });
    expect(customValidate).toHaveBeenCalledWith({ some: 'args' });
  });
});
