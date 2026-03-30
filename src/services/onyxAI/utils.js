import { sub, startOfDay, endOfDay, formatISO } from 'date-fns';

/**
 * Sanitizes a string to remove potentially malicious characters.
 * This is a basic sanitizer and should be expanded based on security requirements.
 * It aims to prevent basic SQL injection and command injection characters.
 *
 * @param {string} input - The string to sanitize.
 * @returns {string} The sanitized string.
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return '';
  }

  // First, trim the input to remove leading/trailing whitespace
  let sanitized = input.trim();

  // Prevent commands from starting with dangerous characters, but allow them inside the string
  // This is less aggressive and allows for more flexible command arguments (e.g., URLs, file paths)
  // We use \s* to also remove any whitespace mixed in with the leading dangerous characters
  // eslint-disable-next-line no-useless-escape
  sanitized = sanitized.replace(/^[;\s'"\\\/&|`<>]+/, '');

  // Trim again in case removing leading characters exposed leading whitespace (e.g. "&& ls" -> " ls" -> "ls")
  sanitized = sanitized.trim();

  // A simple check to prevent "sudo" style commands, as a basic security measure.
  if (sanitized.toLowerCase().startsWith('sudo ')) {
    return 'sudo commands are not permitted.';
  }

  return sanitized;
};

/**
 * Parses a natural language date string into an ISO 8601 date string.
 * Supports expressions like "today", "yesterday", "last 7 days", "2 weeks ago".
 *
 * @param {string} dateString - The natural language date string.
 * @returns {{startDate: string, endDate: string}} An object containing the start and end dates in ISO format.
 */
export const parseDate = (dateString) => {
  const now = new Date();
  const lowerCaseDateString = dateString.toLowerCase();

  if (lowerCaseDateString === 'today') {
    return {
      startDate: formatISO(startOfDay(now)),
      endDate: formatISO(endOfDay(now)),
    };
  }

  if (lowerCaseDateString === 'yesterday') {
    const yesterday = sub(now, { days: 1 });
    return {
      startDate: formatISO(startOfDay(yesterday)),
      endDate: formatISO(endOfDay(yesterday)),
    };
  }

  const daysAgoMatch = lowerCaseDateString.match(/^last (\d+) days$/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    return {
      startDate: formatISO(startOfDay(sub(now, { days }))),
      endDate: formatISO(endOfDay(now)),
    };
  }

  const weeksAgoMatch = lowerCaseDateString.match(/^(\d+) weeks? ago$/);
  if (weeksAgoMatch) {
    const weeks = parseInt(weeksAgoMatch[1], 10);
    const targetDate = sub(now, { weeks });
    return {
      startDate: formatISO(startOfDay(targetDate)),
      endDate: formatISO(endOfDay(targetDate)),
    };
  }

  // Default to returning the original string if no match
  return { startDate: dateString, endDate: dateString };
};
