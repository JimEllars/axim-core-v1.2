// src/services/connectivityManager.js
import logger from '@/services/logging';
import offlineManager from './offline'; // Import the new offline manager
import toast from 'react-hot-toast';

class ConnectivityManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = new Set();
    this.setupEventListeners();
    logger.log(`ConnectivityManager initialized. Initial status: ${this.isOnline ? 'online' : 'offline'}`);
  }

  setupEventListeners() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  handleOnline() {
    if (this.isOnline) return; // Prevent multiple notifications if already online
    logger.log('Connectivity status changed: Online');
    this.isOnline = true;
    toast.success('You are back online. Resuming normal operations.', { id: 'connectivity-status' });
    this.notifyListeners();
    offlineManager.processQueue(); // Process the queue when back online
  }

  handleOffline() {
    if (!this.isOnline) return; // Prevent multiple notifications if already offline
    logger.log('Connectivity status changed: Offline');
    this.isOnline = false;
    toast.error('You are offline. Some features may be limited.', { id: 'connectivity-status', duration: 6000 });
    this.notifyListeners();
  }

  getIsOnline() {
    return this.isOnline;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Immediately notify the new listener of the current state
    listener(this.isOnline);
    // Return an unsubscribe function
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.isOnline);
    }
  }
}

export default new ConnectivityManager();
