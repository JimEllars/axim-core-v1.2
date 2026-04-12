import React from 'react';
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

import { vi } from 'vitest';

global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
window.ResizeObserver = global.ResizeObserver;

// Provide a full mock of the Logger instance
vi.mock('./src/services/logging', () => ({
  default: {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Provide mock Supabase Query logic
vi.mock('./src/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({ data: [], loading: false, error: null })
}));

// Mock api service since it uses submodules internally
vi.mock('./src/services/onyxAI/api', () => ({
  default: {
    getContactsBySource: vi.fn().mockResolvedValue([{source: 'Website', count: 1}]),
    getEventsByType: vi.fn().mockResolvedValue([{type: 'LOGIN', count: 1}]),
    getApiUsageOverTime: vi.fn().mockResolvedValue([{date: '2023-01-01', count: 1}]),
  }
}));

vi.mock('./src/config', () => ({
  default: {
    isMockLlmEnabled: false, // Let tests override
    supabaseUrl: 'http://localhost',
    supabaseAnonKey: 'key',
  }
}));

vi.mock('./src/contexts/DashboardContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDashboard: () => ({ refreshKey: 0 }),
    DashboardProvider: ({ children }) => <>{children}</>
  }
});


// Mock framer-motion to skip animation
vi.mock('framer-motion', () => {
    return {
        motion: {
            div: React.forwardRef(({ children, ...rest }, ref) => {
                const props = { ...rest };
                // remove framer-motion specific props
                delete props.initial;
                delete props.animate;
                delete props.transition;
                return <div ref={ref} {...props}>{children}</div>;
            })
        }
    };
});
