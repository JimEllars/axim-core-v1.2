import { describe, it, expect, vi } from 'vitest';
import offlineManager from '../offline';
import api from '../onyxAI/api';

vi.mock('../onyxAI', () => ({
  default: {
    routeCommand: vi.fn(),
  },
}));

vi.mock('../logging', () => ({
  default: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Benchmark _processRequestQueue', () => {
  it('measures time to process queue', async () => {
    // Clear state
    localStorage.clear();
    offlineManager.requestQueue = [];
    offlineManager.commandQueue = [];
    offlineManager.deadLetterQueue = [];

    // Add real mock functions for api
    api.testMethod1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));
    api.testMethod2 = vi.fn().mockImplementation(() => new Promise((resolve, reject) => setTimeout(() => reject(new Error("Fail")), 50)));

    for (let i = 0; i < 50; i++) {
      offlineManager.queueRequest('testMethod1', []);
      offlineManager.queueRequest('testMethod2', []);
    }

    const startTime = Date.now();
    await offlineManager._processRequestQueue();
    const endTime = Date.now();

    const duration = endTime - startTime;
    console.log(`Processing queue with 100 requests took ${duration}ms.`);

    // Test assertion
    expect(duration).toBeGreaterThan(0);
  }, 10000); // Set timeout to 10 seconds
});
