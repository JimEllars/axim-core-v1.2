import { vi } from 'vitest';
import React from 'react';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Basic mocks for framer-motion to avoid testing actual animations
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props, ref) => <div ref={ref} {...props} />),
    span: React.forwardRef((props, ref) => <span ref={ref} {...props} />),
    tr: React.forwardRef((props, ref) => <tr ref={ref} {...props} />),
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  default: vi.fn()
}));
