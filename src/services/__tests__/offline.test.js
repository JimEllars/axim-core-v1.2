// src/services/__tests__/offline.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import onyxAI from '../onyxAI';
import api from '../onyxAI/api';

// --- Mocks ---
vi.mock('../onyxAI', () => ({
  default: {
    routeCommand: vi.fn(),
  },
}));

vi.mock('../onyxAI/api', () => ({
  default: {
    someApiMethod: vi.fn(),
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


// --- localStorage Mock ---
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


describe('OfflineManager', () => {
  let offlineManager;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();

    // Dynamically import to get a fresh instance with the mocks applied
    const module = await import('../offline');
    offlineManager = module.default;
  });

  it('should initialize with empty queues', () => {
    expect(offlineManager.requestQueue).toEqual([]);
    expect(offlineManager.commandQueue).toEqual([]);
    expect(offlineManager.deadLetterQueue).toEqual([]);
  });

  it('should queue a command', () => {
    offlineManager.queueCommand('test command');
    expect(offlineManager.commandQueue.length).toBe(1);
    expect(offlineManager.commandQueue[0].command).toBe('test command');
  });

  it('should queue a request', () => {
    offlineManager.queueRequest('someApiMethod', ['arg1', 'arg2']);
    expect(offlineManager.requestQueue.length).toBe(1);
    expect(offlineManager.requestQueue[0].methodName).toBe('someApiMethod');
  });

  describe('processQueue', () => {
    it('should process a queued command successfully', async () => {
      offlineManager.queueCommand('help');
      onyxAI.routeCommand.mockResolvedValue('Help message');

      await offlineManager.processQueue();

      expect(onyxAI.routeCommand).toHaveBeenCalledWith('help', { isOfflineSync: true });
      expect(offlineManager.commandQueue.length).toBe(0);
    });

    it('should move a failed command to the dead-letter queue', async () => {
      offlineManager.queueCommand('bad-command');
      onyxAI.routeCommand.mockRejectedValue(new Error('Command failed'));

      await offlineManager.processQueue();

      expect(onyxAI.routeCommand).toHaveBeenCalledWith('bad-command', { isOfflineSync: true });
      expect(offlineManager.commandQueue.length).toBe(0);
      expect(offlineManager.deadLetterQueue.length).toBe(1);
      expect(offlineManager.deadLetterQueue[0].command).toBe('bad-command');
    });

    it('should process a queued request successfully', async () => {
        offlineManager.queueRequest('someApiMethod', ['arg1']);
        api.someApiMethod.mockResolvedValue({ success: true });

        await offlineManager.processQueue();

        expect(api.someApiMethod).toHaveBeenCalledWith('arg1');
        expect(offlineManager.requestQueue.length).toBe(0);
    });

    it('should retry a failing request and eventually move it to the dead-letter queue', async () => {
        offlineManager.queueRequest('someApiMethod', ['arg1']);
        api.someApiMethod.mockRejectedValue(new Error('API failed'));

        // We need to call processQueue multiple times to simulate retries
        for (let i = 0; i < 5; i++) {
            // Reset the processing flag to allow the queue to be processed again
            offlineManager.isProcessing = false;
            await offlineManager.processQueue();
        }

        expect(api.someApiMethod).toHaveBeenCalledTimes(5);
        expect(offlineManager.requestQueue.length).toBe(0);
        expect(offlineManager.deadLetterQueue.length).toBe(1);
        expect(offlineManager.deadLetterQueue[0].methodName).toBe('someApiMethod');
    });
  });
});
