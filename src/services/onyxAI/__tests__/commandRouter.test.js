import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findCommand } from '../commandRouter';
import { CommandNotFoundError } from '../errors';
import commands from '../commands';

// Mock the commands module. This will be hoisted by Vitest.
vi.mock('../commands', () => ({
  default: [],
}));

describe('Command Router', () => {
  beforeEach(() => {
    // Clear the mocked commands array before each test
    commands.length = 0;
  });

  describe('findCommand - Keyword and Alias Matching', () => {
    it('should find a command by a single keyword', () => {
      commands.push({ name: 'testCmd', keywords: ['test'] });

      const result = findCommand('test');
      expect(result.name).toBe('testCmd');
    });

    it('should find a command by one of multiple keywords', () => {
      commands.push({ name: 'multiKey', keywords: ['alpha', 'beta', 'gamma'] });

      expect(findCommand('beta').name).toBe('multiKey');
      expect(findCommand('gamma').name).toBe('multiKey');
    });

    it('should find a command by an alias when keywords are also present', () => {
      commands.push({ name: 'aliasCmd', keywords: ['primary'], aliases: ['a1', 'a2'] });

      expect(findCommand('a2').name).toBe('aliasCmd');
    });

    it('should find a command by an alias when NO keywords are present', () => {
      commands.push({ name: 'onlyAlias', aliases: ['xyz'] });

      expect(findCommand('xyz').name).toBe('onlyAlias');
    });

    it('should ignore commands that match neither keyword nor alias', () => {
      commands.push({ name: 'wrongCmd', keywords: ['wrong'], aliases: ['bad'] });
      commands.push({ name: 'rightCmd', keywords: ['right'] });

      expect(findCommand('right').name).toBe('rightCmd');
    });

    it('should handle commands missing both keywords and aliases gracefully without crashing', () => {
      commands.push({ name: 'emptyCmd' }); // no keywords or aliases
      commands.push({ name: 'target', keywords: ['target'] });

      expect(findCommand('target').name).toBe('target');
    });

    it('should handle case-insensitive matches', () => {
      commands.push({ name: 'caseCmd', keywords: ['casey'], aliases: ['cy'] });

      expect(findCommand('CASEY').name).toBe('caseCmd');
      expect(findCommand('Cy').name).toBe('caseCmd');
    });

    it('should handle leading and trailing whitespace in the command input', () => {
      commands.push({ name: 'spaceCmd', keywords: ['space'] });

      expect(findCommand('  space  ').name).toBe('spaceCmd');
    });

    it('should isolate the command from its arguments', () => {
      commands.push({ name: 'argCmd', keywords: ['run'] });

      // 'run' is the command, '--fast true' are arguments
      expect(findCommand('run --fast true').name).toBe('argCmd');
    });

    it('should return the first matching command when multiple commands share the same keyword', () => {
      commands.push({ name: 'firstCmd', keywords: ['shared'] });
      commands.push({ name: 'secondCmd', keywords: ['shared'] });

      // The find() method should return the first one inserted
      expect(findCommand('shared').name).toBe('firstCmd');
    });

    it('should handle a command with an empty keywords array and match by alias', () => {
      commands.push({ name: 'emptyKw', keywords: [], aliases: ['found-alias'] });
      expect(findCommand('found-alias').name).toBe('emptyKw');
    });

    it('should handle a command with an empty aliases array and match by keyword', () => {
      commands.push({ name: 'emptyAl', keywords: ['found-kw'], aliases: [] });
      expect(findCommand('found-kw').name).toBe('emptyAl');
    });
  });

  describe('findCommand - Return Behavior', () => {
    it('should return a copy of the command object to prevent mutation', () => {
      const originalCmd = { name: 'mutateCmd', keywords: ['mut'] };
      commands.push(originalCmd);

      const result = findCommand('mut');
      expect(result).not.toBe(originalCmd); // Different reference
      expect(result).toEqual(originalCmd); // Same content
    });

    it('should return the default command if no specific command matches', () => {
      commands.push({ name: 'defaultCmd', isDefault: true });
      commands.push({ name: 'other', keywords: ['other'] });

      const result = findCommand('nonexistent');
      expect(result.name).toBe('defaultCmd');
    });

    it('should throw CommandNotFoundError if no specific command matches and no default exists', () => {
      commands.push({ name: 'someCmd', keywords: ['some'] }); // Not a default

      expect(() => findCommand('missing')).toThrow(CommandNotFoundError);
      expect(() => findCommand('missing')).toThrow('Command "missing" not found.');
    });
  });
});
