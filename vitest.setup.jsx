import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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

// Mock framer-motion entirely to prevent rAF loops
vi.mock('framer-motion', () => {
  return {
    motion: {
      div: 'div',
      tr: 'tr',
      span: 'span',
      p: 'p',
      button: 'button',
      h2: 'h2',
      h3: 'h3',
      h4: 'h4',
      ul: 'ul',
      li: 'li',
      a: 'a',
      nav: 'nav',
      header: 'header'
    },
    AnimatePresence: ({ children }) => children,
  };
});

// Mock Supabase
vi.mock('./src/services/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      channel: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockReturnThis(),
      functions: {
        invoke: vi.fn()
      }
    }
  };
});

vi.mock('./src/services/supabaseApiService', () => {
  return {
    default: {
      supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        channel: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        removeChannel: vi.fn().mockReturnThis(),
        rpc: vi.fn().mockReturnThis(),
        functions: {
          invoke: vi.fn()
        }
      }
    }
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

afterEach(() => {
  vi.clearAllTimers();
  cleanup();
});

global.fetch = vi.fn();
