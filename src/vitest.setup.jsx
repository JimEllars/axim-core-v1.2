import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import React from 'react';
import api from './services/onyxAI/api';
import { cleanup } from '@testing-library/react';

// Mock crypto.randomUUID for JSDOM if not present
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// Ensure a div with id="root" exists in the body for React 18's createRoot
if (!document.getElementById('root')) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
}


// Mock src/config BEFORE anything else.
// This is crucial because supabaseClient.js reads it at the top level.
vi.mock('./config', () => ({
  default: {
    supabaseUrl: 'http://localhost:54321',
    supabaseAnonKey: 'test-anon-key',
    isMockLlmEnabled: false,
  }
}));

// Mock axios globally to prevent network calls from gcpApiService during initialization
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: 'OK' }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        interceptors: {
            request: { use: vi.fn(), eject: vi.fn() },
            response: { use: vi.fn(), eject: vi.fn() }
        }
      })),
    },
  };
});

// Mock window.location
const mockLocation = new URL('http://localhost:5176');
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    href: mockLocation.href,
    origin: mockLocation.origin,
    protocol: mockLocation.protocol,
    host: mockLocation.host,
    hostname: mockLocation.hostname,
    port: mockLocation.port,
    pathname: mockLocation.pathname,
    search: mockLocation.search,
    hash: mockLocation.hash,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
  writable: true,
});


// Mock ResizeObserver for recharts
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

// Mock window.matchMedia for react-hot-toast and other libraries
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

// Mock getComputedStyle which is used by recharts and not fully implemented in JSDOM
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt, pseudoElt) => {
  const style = originalGetComputedStyle(elt, pseudoElt);
  // JSDOM doesn't implement this property, so we provide a default
  if (style.getPropertyValue('animation-duration') === '') {
    style.getPropertyValue = (prop) => {
      if (prop === 'animation-duration') {
        return '0s';
      }
      return originalGetComputedStyle(elt, pseudoElt).getPropertyValue(prop);
    };
  }
  return style;
};

// Mock framer-motion with a more robust proxy-based approach
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');

  // A factory that creates a mock motion component, filtering out motion-specific props
  const createMockMotionComponent = (tag) => {
    return React.forwardRef(({ children, whileHover, whileTap, animate, initial, exit, layout, transition, ...props }, ref) => {
      return React.createElement(tag, { ...props, ref }, children);
    });
  };

  // Use a Proxy to dynamically create mock components for any HTML tag
  const motion = new Proxy(actual.motion, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return createMockMotionComponent(prop);
      }
      return Reflect.get(target, prop);
    }
  });

  return {
    ...actual,
    motion,
    AnimatePresence: ({ children }) => <>{children}</>,
  };
});


const mockSupabaseBuilder = {
  select: vi.fn(function() { return this; }),
  insert: vi.fn(function() { return this; }),
  update: vi.fn(function() { return this; }),
  delete: vi.fn(function() { return this; }),
  upsert: vi.fn(function() { return this; }),
  eq: vi.fn(function() { return this; }),
  neq: vi.fn(function() { return this; }),
  gt: vi.fn(function() { return this; }),
  gte: vi.fn(function() { return this; }),
  lt: vi.fn(function() { return this; }),
  lte: vi.fn(function() { return this; }),
  like: vi.fn(function() { return this; }),
  ilike: vi.fn(function() { return this; }),
  is: vi.fn(function() { return this; }),
  in: vi.fn(function() { return this; }),
  contains: vi.fn(function() { return this; }),
  order: vi.fn(function() { return this; }),
  limit: vi.fn(function() { return this; }),
  single: vi.fn(function() { return this; }),
  maybeSingle: vi.fn(function() { return this; }),
  then: (resolve) => resolve({ data: [], error: null, count: 0 }),
};

const mockSupabaseClient = {
  from: vi.fn(() => mockSupabaseBuilder),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  auth: {
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    admin: {
        inviteUserByEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
        deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Initialize the api service with the mocked supabase client
api.initialize(mockSupabaseClient);

// Mock the Electron API bridge for tests in a JSDOM environment
vi.stubGlobal('electronAPI', {
  getSystemInfo: vi.fn().mockResolvedValue({
    platform: 'test-os',
    release: '1.0.0',
    arch: 'x64',
    cpuModel: 'Test CPU',
    totalMemory: 8 * 1024 * 1024 * 1024, // 8 GB
    freeMemory: 4 * 1024 * 1024 * 1024, // 4 GB
    uptime: 3600, // 1 hour
  }),
  invoke: vi.fn((channel, ...args) => {
    // console.warn(`[Mock IPC] Unhandled invoke for channel "${channel}" with args:`, args);
    if (channel === 'get-system-info') {
      return Promise.resolve({ platform: 'test-os' });
    }
    return Promise.resolve(null);
  }),
  send: vi.fn((channel, ...args) => {
    // console.warn(`[Mock IPC] Unhandled send for channel "${channel}" with args:`, args);
  }),
  on: vi.fn((channel, listener) => {
    // console.warn(`[Mock IPC] Listener registered for unhandled channel "${channel}".`);
    return () => {}; // Return a dummy unsubscribe function
  }),
  removeAllListeners: vi.fn(),
});

// Add cleanup after each test
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
