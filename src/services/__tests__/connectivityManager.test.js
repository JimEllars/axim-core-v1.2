// src/services/__tests__/connectivityManager.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import offlineManager from '../offline';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../offline', () => ({
  default: {
    processQueue: vi.fn(),
  },
}));

vi.mock('../logging', () => ({
  default: {
    log: vi.fn(),
    warn: vi.fn(),
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

  it("should initialize with offline status if navigator.onLine is false", async () => {
    vi.resetModules(); // Reset again for this specific test
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    // Dynamically import the module to get a fresh instance with the new navigator state
    const cmModule = await import('../connectivityManager');
    const offlineConnectivityManager = cmModule.default;

    expect(offlineConnectivityManager.getIsOnline()).toBe(false);
  });

  it("should not execute handleOnline logic if already online", () => {
    const listener = vi.fn();
    connectivityManager.subscribe(listener);
    listener.mockClear();

    // Already online from beforeEach initialization, simulate online event again
    eventListeners.online();

    expect(listener).not.toHaveBeenCalled();
    expect(offlineManager.processQueue).not.toHaveBeenCalled();
  });

  it("should not execute handleOffline logic if already offline", async () => {
    // Re-initialize as offline
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const cmModule = await import('../connectivityManager');
    const offlineManagerInstance = cmModule.default;

    const listener = vi.fn();
    offlineManagerInstance.subscribe(listener);
    listener.mockClear();

    // Already offline, simulate offline event again
    eventListeners.offline();

    expect(listener).not.toHaveBeenCalled();
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

  it('should call toast notifications with correct arguments on status changes', () => {
    // Online -> Offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    eventListeners.offline();

    expect(toast.error).toHaveBeenCalledWith('You are offline. Some features may be limited.', { id: 'connectivity-status', duration: 6000 });

    // Offline -> Online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    eventListeners.online();

    expect(toast.success).toHaveBeenCalledWith('You are back online. Resuming normal operations.', { id: 'connectivity-status' });
  });

  it('should unsubscribe listeners correctly via returned function', () => {
    const listener = vi.fn();
    const unsubscribe = connectivityManager.subscribe(listener);
    listener.mockClear();

    unsubscribe();

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    eventListeners.offline();

    expect(listener).not.toHaveBeenCalled();
  });

  it('should unsubscribe listeners correctly via explicit unsubscribe method', () => {
    const listener = vi.fn();
    connectivityManager.subscribe(listener);
    listener.mockClear();

    connectivityManager.unsubscribe(listener);

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    eventListeners.offline();

    expect(listener).not.toHaveBeenCalled();
  });
});
