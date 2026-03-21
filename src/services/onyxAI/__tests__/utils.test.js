import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDate, sanitizeInput } from '../utils';
import { formatISO, startOfDay, endOfDay, sub } from 'date-fns';

describe('OnyxAI Utils', () => {
  describe('parseDate', () => {
    const mockNow = new Date('2024-03-20T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should parse "today" correctly', () => {
      const result = parseDate('today');
      expect(result.startDate).toBe(formatISO(startOfDay(mockNow)));
      expect(result.endDate).toBe(formatISO(endOfDay(mockNow)));
    });

    it('should parse "YESTERDAY" (case insensitivity) correctly', () => {
      const result = parseDate('YESTERDAY');
      const yesterday = sub(mockNow, { days: 1 });
      expect(result.startDate).toBe(formatISO(startOfDay(yesterday)));
      expect(result.endDate).toBe(formatISO(endOfDay(yesterday)));
    });

    it('should parse "last 7 days" correctly', () => {
      const result = parseDate('last 7 days');
      const sevenDaysAgo = sub(mockNow, { days: 7 });
      expect(result.startDate).toBe(formatISO(startOfDay(sevenDaysAgo)));
      expect(result.endDate).toBe(formatISO(endOfDay(mockNow)));
    });

    it('should parse "last 30 days" correctly', () => {
      const result = parseDate('last 30 days');
      const thirtyDaysAgo = sub(mockNow, { days: 30 });
      expect(result.startDate).toBe(formatISO(startOfDay(thirtyDaysAgo)));
      expect(result.endDate).toBe(formatISO(endOfDay(mockNow)));
    });

    it('should parse "1 week ago" correctly', () => {
      const result = parseDate('1 week ago');
      const oneWeekAgo = sub(mockNow, { weeks: 1 });
      expect(result.startDate).toBe(formatISO(startOfDay(oneWeekAgo)));
      expect(result.endDate).toBe(formatISO(endOfDay(oneWeekAgo)));
    });

    it('should parse "2 weeks ago" correctly', () => {
      const result = parseDate('2 weeks ago');
      const twoWeeksAgo = sub(mockNow, { weeks: 2 });
      expect(result.startDate).toBe(formatISO(startOfDay(twoWeeksAgo)));
      expect(result.endDate).toBe(formatISO(endOfDay(twoWeeksAgo)));
    });

    it('should return original string for unknown date formats', () => {
      const unknownDate = 'next year';
      const result = parseDate(unknownDate);
      expect(result.startDate).toBe(unknownDate);
      expect(result.endDate).toBe(unknownDate);
    });
  });

  describe('sanitizeInput', () => {
    it('should return an empty string for non-string inputs', () => {
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
      expect(sanitizeInput(123)).toBe('');
      expect(sanitizeInput({})).toBe('');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(sanitizeInput('  hello world  ')).toBe('hello world');
      expect(sanitizeInput('   ')).toBe('');
      expect(sanitizeInput('\n\t hello \n')).toBe('hello');
    });

    it('should remove leading dangerous characters and trim again', () => {
      expect(sanitizeInput(';rm -rf /')).toBe('rm -rf /');
      expect(sanitizeInput('&& ls')).toBe('ls'); // & is in the list, then space trimmed
      expect(sanitizeInput('|| whoami')).toBe('whoami'); // | is in the list
      expect(sanitizeInput('< script >')).toBe('script >');
      expect(sanitizeInput('">test"')).toBe('test"');
      expect(sanitizeInput("' OR 1=1")).toBe('OR 1=1');
      expect(sanitizeInput('\\some/path')).toBe('some/path');
      expect(sanitizeInput('`; ls')).toBe('ls');
    });

    it('should handle strings with multiple mixed leading dangerous characters', () => {
      expect(sanitizeInput(';\'"\\/&|`<>hello')).toBe('hello');
      expect(sanitizeInput('  ; | &&   hello world  ')).toBe('hello world');
    });

    it('should return empty string if input contains only dangerous characters', () => {
      expect(sanitizeInput(';;;')).toBe('');
      expect(sanitizeInput('&&||')).toBe('');
      expect(sanitizeInput('  "\'<>  ')).toBe('');
    });

    it('should allow dangerous characters if they are not at the beginning', () => {
      expect(sanitizeInput('echo "hello"')).toBe('echo "hello"');
      expect(sanitizeInput('cat /etc/passwd')).toBe('cat /etc/passwd');
      expect(sanitizeInput('git log --pretty=format:"%h"')).toBe('git log --pretty=format:"%h"');
    });

    it('should block sudo commands', () => {
      expect(sanitizeInput('sudo apt-get update')).toBe('sudo commands are not permitted.');
      expect(sanitizeInput('SUDO rm -rf /')).toBe('sudo commands are not permitted.');
    });

    it('should correctly block sudo even if hidden behind whitespace or dangerous characters', () => {
      expect(sanitizeInput('  sudo ls')).toBe('sudo commands are not permitted.');
      expect(sanitizeInput('; sudo ls')).toBe('sudo commands are not permitted.');
      expect(sanitizeInput('&&sudo rm')).toBe('sudo commands are not permitted.'); // "&&sudo rm" -> "sudo rm" -> blocks
    });

    it('should allow strings that contain "sudo" but do not start with it', () => {
      expect(sanitizeInput('How to use sudo?')).toBe('How to use sudo?');
    });

    it('should allow sudo without a trailing space to pass through', () => {
      expect(sanitizeInput('sudo')).toBe('sudo');
      expect(sanitizeInput('sudo\trm')).toBe('sudo\trm');
    });
  });
});
