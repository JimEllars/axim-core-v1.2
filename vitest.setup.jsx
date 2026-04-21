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
