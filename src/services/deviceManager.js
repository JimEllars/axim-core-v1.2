// src/services/deviceManager.js
import { v4 as uuidv4 } from 'uuid';
import ApiService from '@/services/onyxAI/api';
import logger from '@/services/logging';
import { getOS } from '@/utils/osDetection';

const DEVICE_ID_KEY = 'axim_device_id';
const DEVICE_NAME_KEY = 'axim_device_name';
const ACTIVE_HEARTBEAT_INTERVAL = 1 * 60 * 1000;
const IDLE_HEARTBEAT_INTERVAL = 10 * 60 * 1000;
const IDLE_TIMEOUT = 5 * 60 * 1000;

// Default timer functions that use the global window object
const defaultTimerFunctions = {
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (cb, ms) => window.setInterval(cb, ms),
  clearInterval: (id) => window.clearInterval(id),
};

export class DeviceManager {
  constructor(
    apiService = ApiService,
    storage = localStorage,
    nav = navigator,
    win = window,
    timerFunctions = defaultTimerFunctions // Inject timer functions
  ) {
    this.apiService = apiService;
    this.storage = storage;
    this.navigator = nav;
    this.window = win;
    this.timers = timerFunctions; // Use injected timers

    this.deviceId = null;
    this.deviceName = null;
    this.userId = null;
    this.heartbeatIntervalId = null;
    this.idleTimeoutId = null;
    this.isElectron = !!this.window.electronAPI;
    this.registrationStatus = 'unregistered';
  }

  initialize(userId) {
    if (!userId) {
      logger.warn('DeviceManager: Cannot initialize without a userId.');
      return;
    }
    if (this.userId && this.userId !== userId) {
      this.reset();
    }
    this.userId = userId;
    this.loadOrGenerateDeviceInfo();
    this.startHeartbeat();
    this.setupActivityListeners();
    this.window.addEventListener('beforeunload', () => this.shutdown());
  }

  loadOrGenerateDeviceInfo() {
    this.deviceId = this.storage.getItem(DEVICE_ID_KEY);
    if (!this.deviceId) {
      this.deviceId = uuidv4();
      this.storage.setItem(DEVICE_ID_KEY, this.deviceId);
    }
    this.forceRegister();
  }

  async forceRegister() {
    if (this.registrationStatus === 'pending') return;
    this.registrationStatus = 'pending';

    try {
      this.deviceName = this.storage.getItem(DEVICE_NAME_KEY) || await this.generateDeviceName();
      this.storage.setItem(DEVICE_NAME_KEY, this.deviceName);

      const systemInfo = await this.getSystemInfo();
      await this.apiService.registerDevice(this.deviceId, this.deviceName, systemInfo, this.userId);
      this.registrationStatus = 'registered';
      this.sendHeartbeat();
    } catch (error) {
      logger.error('Device registration failed. Will retry on the next heartbeat.', error);
      this.registrationStatus = 'unregistered';
    }
  }

  async getSystemInfo() {
    if (this.isElectron && this.window.electronAPI) {
        return await this.window.electronAPI.getSystemInfo();
    }
    const platform = getOS();
    return { platform, userAgent: this.navigator.userAgent };
  }

  async generateDeviceName() {
    const info = await this.getSystemInfo();
    if (this.isElectron) return `${info.platform} Desktop`;
    const ua = info.userAgent.toLowerCase();
    let browser = 'Unknown Browser';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    return `${browser} on ${info.platform}`;
  }

  setupActivityListeners() {
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    const resetIdleTimer = () => {
      this.timers.clearTimeout(this.idleTimeoutId);
      this.setHeartbeatInterval(ACTIVE_HEARTBEAT_INTERVAL);
      this.idleTimeoutId = this.timers.setTimeout(() => {
        this.setHeartbeatInterval(IDLE_HEARTBEAT_INTERVAL);
      }, IDLE_TIMEOUT);
    };
    activityEvents.forEach(event => this.window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();
  }

  setHeartbeatInterval(interval) {
    this.timers.clearInterval(this.heartbeatIntervalId);
    this.heartbeatIntervalId = this.timers.setInterval(() => this.sendHeartbeat(), interval);
  }

  startHeartbeat() {
    this.setHeartbeatInterval(ACTIVE_HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    this.timers.clearInterval(this.heartbeatIntervalId);
    this.timers.clearTimeout(this.idleTimeoutId);
  }

  async sendHeartbeat() {
    if (!this.deviceId || !this.userId) return;
    if (this.registrationStatus !== 'registered') {
      await this.forceRegister();
      return;
    }
    try {
      const systemInfo = await this.getSystemInfo();
      await this.apiService.sendDeviceHeartbeat(this.deviceId, systemInfo);
    } catch (error) {
      logger.warn('Failed to send device heartbeat. Marking as unregistered.');
      this.registrationStatus = 'unregistered';
    }
  }

  shutdown() {
    if (this.navigator.sendBeacon) {
      const beaconUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/device-status`;
      const data = JSON.stringify({ deviceId: this.deviceId, status: 'offline-beacon' });
      this.navigator.sendBeacon(beaconUrl, new Blob([data], { type: 'application/json' }));
    } else {
      this.apiService.updateDeviceStatus(this.deviceId, 'offline');
    }
  }

  reset() {
    this.timers.clearInterval(this.heartbeatIntervalId);
    this.timers.clearTimeout(this.idleTimeoutId);
    this.userId = null;
    this.deviceId = null;
    this.deviceName = null;
    this.registrationStatus = 'unregistered';
  }

  getDeviceId() {
    return this.deviceId;
  }
}

export default new DeviceManager();
