// src/services/__tests__/connectivityManager.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import offlineManager from '../offline';

vi.mock('../offline', () => ({
  default: {
    processQueue: vi.fn(),
  },
}));

vi.mock('@/services/logging', () => ({
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
  },
}));


describe('ConnectivityManager', () => {
  let connectivityManager;
  const eventListeners = {};

  beforeEach(async () => {
    vi.resetModules();

    // Mock addEventListener to capture the handlers, preventing global pollution
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
        eventListeners[event] = handler;
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((event) => {
        delete eventListeners[event];
    });

    // Set the initial state of the navigator BEFORE the module is imported.
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });

    // Dynamically import the module to get a fresh instance.
    const cmModule = await import('../connectivityManager');
    connectivityManager = cmModule.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with the browser's online status", () => {
    expect(connectivityManager.getIsOnline()).toBe(true);
  });

  it('should notify listeners and process queue on status changes', () => {
    const listener = vi.fn();
    connectivityManager.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(true);
    listener.mockClear();

    // Simulate going offline by directly calling the captured handler
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    eventListeners.offline();

    expect(listener).toHaveBeenCalledWith(false);
    expect(offlineManager.processQueue).not.toHaveBeenCalled();

    // Simulate going back online by directly calling the captured handler
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    eventListeners.online();

    expect(listener).toHaveBeenCalledWith(true);
    expect(offlineManager.processQueue).toHaveBeenCalledTimes(1);
  });
});
