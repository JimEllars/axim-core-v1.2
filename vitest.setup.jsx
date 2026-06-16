import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock react-hot-toast globally to prevent matchMedia errors
vi.mock('react-hot-toast', () => {
  return {
    default: {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    },
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    },
    Toaster: () => null,
  };
});

// Mock framer-motion AnimatePresence to bypass the missing export issue
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    AnimatePresence: ({ children }) => <>{children}</>,
  };
});

// Suppress console.error in tests to avoid noisy output for expected failures
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('IntentParsingError') || args[0].includes('invalid command') || args[0].includes('Warning: React does not recognize') || args[0].includes('act('))
  ) {
    return;
  }
  originalConsoleError(...args);
};

// Also suppress console.warn for known warnings during tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('[AXiM Core Config] Missing essential environment variables'))
  ) {
    return;
  }
  originalConsoleWarn(...args);
};
