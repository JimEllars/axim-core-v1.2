import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceManager } from '../deviceManager';
import logger from '@/services/logging';
import { Blob } from 'node:buffer';

// Mock for global Blob, required by JSDOM environment
global.Blob = Blob;

// Mock logger
vi.mock('@/services/logging', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// --- Mocks ---
const mockApiService = {
  registerDevice: vi.fn(),
  sendDeviceHeartbeat: vi.fn(),
  updateDeviceStatus: vi.fn(),
};

const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};

const mockNavigator = {
  sendBeacon: vi.fn(),
  userAgent: 'TestBrowser/1.0 Chrome/108.0.0.0',
  platform: 'TestPlatform',
};

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  electronAPI: {
    getSystemInfo: vi.fn().mockResolvedValue({ platform: 'electron-test' }),
  },
};

const mockTimerFunctions = {
  setTimeout: vi.fn(),
  clearTimeout: vi.fn(),
  setInterval: vi.fn(),
  clearInterval: vi.fn(),
};

let deviceManager;

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deviceManager = new DeviceManager(
      mockApiService,
      mockStorage,
      mockNavigator,
      mockWindow,
      mockTimerFunctions
    );
  });

  it('should initialize and trigger registration', () => {
    const registerSpy = vi.spyOn(deviceManager, 'forceRegister');
    deviceManager.initialize('user-123');
    expect(registerSpy).toHaveBeenCalled();
    expect(deviceManager.userId).toBe('user-123');
  });

  it('should log warning and not initialize if userId is missing', () => {
    const registerSpy = vi.spyOn(deviceManager, 'forceRegister');
    deviceManager.initialize(null);
    expect(logger.warn).toHaveBeenCalledWith('DeviceManager: Cannot initialize without a userId.');
    expect(registerSpy).not.toHaveBeenCalled();
    expect(deviceManager.userId).toBeNull();
  });

  it('should not send heartbeat if not initialized', async () => {
    await deviceManager.sendHeartbeat();
    expect(mockApiService.sendDeviceHeartbeat).not.toHaveBeenCalled();
    expect(mockApiService.registerDevice).not.toHaveBeenCalled();
  });

  it('should register a new device if none exists', async () => {
    mockStorage.getItem.mockReturnValue(null);
    mockApiService.registerDevice.mockResolvedValue({ success: true });
    // Ensure getSystemInfo returns a valid object
    mockWindow.electronAPI.getSystemInfo.mockResolvedValue({ platform: 'electron-test' });

    // Initialize triggers the registration flow
    deviceManager.initialize('test-user');

    // Wait for the async registration triggered by initialize to complete
    await vi.waitFor(() => {
      expect(mockApiService.registerDevice).toHaveBeenCalled();
    });

    expect(deviceManager.registrationStatus).toBe('registered');
    expect(deviceManager.deviceId).toBeDefined();
    // Validate that the generated deviceId is a valid UUID
    expect(deviceManager.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should send a heartbeat when registered', async () => {
    mockStorage.getItem.mockReturnValue('test-device-id');
    mockApiService.registerDevice.mockResolvedValue({ success: true });

    // Initialize triggers registration
    deviceManager.initialize('test-user');

    // Wait for registration to complete to ensure stable state
    await vi.waitFor(() => {
      expect(deviceManager.registrationStatus).toBe('registered');
    });

    await deviceManager.sendHeartbeat();

    expect(mockApiService.sendDeviceHeartbeat).toHaveBeenCalled();
  });

  it('should re-register on heartbeat if not registered', async () => {
    // Verifies that if the device becomes unregistered (e.g. heartbeat failure), it attempts to re-register.
    // Proper initialization via .initialize() ensures the deviceId and userId are correctly set.

    // 1. Setup for successful initial registration
    mockStorage.getItem.mockReturnValue('test-device-id');
    mockApiService.registerDevice.mockResolvedValue({ success: true });
    // Ensure system info is available
    mockWindow.electronAPI.getSystemInfo.mockResolvedValue({ platform: 'electron-test' });

    // 2. Initialize (Real registration)
    deviceManager.initialize('test-user');

    // Wait for registration
    await vi.waitFor(() => {
      expect(deviceManager.registrationStatus).toBe('registered');
    });
    expect(deviceManager.userId).toBe('test-user');
    expect(deviceManager.deviceId).toBe('test-device-id');

    // 3. Spy on forceRegister
    const registerSpy = vi.spyOn(deviceManager, 'forceRegister');

    // 4. Simulate heartbeat failure
    mockApiService.sendDeviceHeartbeat.mockRejectedValueOnce(new Error('Heartbeat failed'));

    await deviceManager.sendHeartbeat();

    expect(deviceManager.registrationStatus).toBe('unregistered');

    // 5. Trigger re-registration
    await deviceManager.sendHeartbeat();

    expect(registerSpy).toHaveBeenCalled();

    // Verify successful re-registration
    await vi.waitFor(() => {
      expect(deviceManager.registrationStatus).toBe('registered');
    });
  });

  it('should handle registration failure gracefully', async () => {
    mockStorage.getItem.mockReturnValue('test-device-id');
    mockApiService.registerDevice.mockRejectedValue(new Error('Registration failed'));
    mockWindow.electronAPI.getSystemInfo.mockResolvedValue({ platform: 'electron-test' });

    deviceManager.initialize('test-user');

    await vi.waitFor(() => {
      expect(mockApiService.registerDevice).toHaveBeenCalled();
    });

    expect(deviceManager.registrationStatus).toBe('unregistered');
    expect(logger.error).toHaveBeenCalledWith(
      'Device registration failed. Will retry on the next heartbeat.',
      expect.any(Error)
    );
  });

  it('should use sendBeacon on shutdown when available', () => {
    mockStorage.getItem.mockReturnValue('test-device-id');
    deviceManager.initialize('test-user');
    deviceManager.shutdown();
    expect(mockNavigator.sendBeacon).toHaveBeenCalled();
    expect(mockApiService.updateDeviceStatus).not.toHaveBeenCalled();
  });

  it('should fall back to API call if sendBeacon is unavailable', () => {
    mockStorage.getItem.mockReturnValue('test-device-id');
    const navWithoutBeacon = { ...mockNavigator, sendBeacon: undefined };
    const dm = new DeviceManager(mockApiService, mockStorage, navWithoutBeacon, mockWindow, mockTimerFunctions);
    dm.initialize('test-user');

    dm.shutdown();

    expect(mockApiService.updateDeviceStatus).toHaveBeenCalled();
  });

  it('should reset state when initializing with a different user', async () => {
    mockWindow.electronAPI.getSystemInfo.mockResolvedValue({ platform: 'electron-test' });
    deviceManager.initialize('user-1');
    expect(deviceManager.userId).toBe('user-1');

    // Wait for the first initialization async work
    await vi.waitFor(() => {
      expect(mockApiService.registerDevice).toHaveBeenCalled();
    });
    mockApiService.registerDevice.mockClear();

    // Spy on reset
    const resetSpy = vi.spyOn(deviceManager, 'reset');

    deviceManager.initialize('user-2');

    expect(resetSpy).toHaveBeenCalled();
    expect(deviceManager.userId).toBe('user-2');

    // Wait for the second initialization async work to ensure clean teardown
    await vi.waitFor(() => {
      expect(mockApiService.registerDevice).toHaveBeenCalled();
    });
  });

  it('should return the current deviceId via getDeviceId', () => {
    mockStorage.getItem.mockReturnValue('test-device-id');
    deviceManager.initialize('test-user');
    expect(deviceManager.getDeviceId()).toBe('test-device-id');
  });
});
