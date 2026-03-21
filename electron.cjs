const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

let win; // Make win accessible to the entire module

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Secure defaults
      nodeIntegration: false,
      contextIsolation: true,
      // The preload script is the secure bridge between the renderer and main processes
      preload: path.join(__dirname, 'electron/preload/index.js'),
    },
  });

  const isDev = process.env.NODE_ENV !== 'production';

  const url = isDev
    ? 'http://localhost:5176'
    : `file://${path.join(__dirname, 'dist', 'index.html')}`;

  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  // Register the secure API handlers
  const { registerApiHandlers } = require('./electron/main/apiHandlers.cjs');
  registerApiHandlers();

  if (process.env.NODE_ENV !== 'production') {
    console.log('Skipping auto-update check in development mode.');
  } else {
    console.log('Setting up auto-updater.');

    // Listen for the command from the renderer process to restart and install the update
    ipcMain.on('restart-app', () => {
      autoUpdater.quitAndInstall();
    });

    // Listen for the command from the renderer process to manually check for updates
    ipcMain.on('check-for-updates', () => {
      console.log('Manual update check requested.');
      autoUpdater.checkForUpdates();
    });

    autoUpdater.on('checking-for-update', () => {
      if (win) win.webContents.send('update-status', 'Checking for updates...');
      console.log('Checking for update...');
    });
    autoUpdater.on('update-available', (info) => {
      if (win) win.webContents.send('update-status', 'Update available. Downloading...');
      console.log('Update available.', info);
    });
    autoUpdater.on('update-not-available', (info) => {
      if (win) win.webContents.send('update-status', 'You are on the latest version.');
      console.log('Update not available.', info);
    });
    autoUpdater.on('error', (err) => {
      if (win) win.webContents.send('update-status', `Error in auto-updater: ${err.toString()}`);
      console.error('Error in auto-updater.', err);
    });
    autoUpdater.on('download-progress', (progressObj) => {
      const log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      if (win) win.webContents.send('update-status', log_message);
      console.log(log_message);
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (win) win.webContents.send('update-downloaded', info);
      console.log('Update downloaded.', info);
    });

    autoUpdater.checkForUpdates(); // Changed from checkForUpdatesAndNotify to have more control
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler for system information
ipcMain.handle('get-system-info', async () => {
  const os = require('os');
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: os.cpus()[0].model,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
  };
});

ipcMain.handle('ping-host', async (event, url) => {
  try {
    // SSRF / Port Scanning Protection
    // Validate the URL before passing it to net.request
    const parsedUrl = new URL(url);

    // 1. Restrict protocol
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.warn(`[Security] Blocked ping to invalid protocol: ${parsedUrl.protocol}`);
      return false;
    }

    // 2. Prevent local / private network / cloud metadata scanning
    const hostname = parsedUrl.hostname;

    // Check if hostname resolves to local or private IP addresses
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const isLoopback = /^127(?:\.[0-9]+){0,2}\.[0-9]+$/.test(hostname) || hostname === '[::1]' || hostname === '::1';
    const isZero = hostname === '0.0.0.0' || hostname === '[::]' || hostname === '::';
    const isPrivateIPv4 =
      /^10(?:\.[0-9]+){0,2}\.[0-9]+$/.test(hostname) ||
      /^192\.168(?:\.[0-9]+){0,2}\.[0-9]+$/.test(hostname) ||
      /^172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.[0-9]+){0,2}\.[0-9]+$/.test(hostname);
    const isCloudMetadata = hostname === '169.254.169.254';

    if (isLocalhost || isLoopback || isZero || isPrivateIPv4 || isCloudMetadata) {
      console.warn(`[Security] Blocked ping to restricted hostname/IP: ${hostname}`);
      return false;
    }

    const { net } = require('electron');
    const request = net.request(url);
    return new Promise((resolve) => {
      request.on('response', () => {
        resolve(true);
      });
      request.on('error', (error) => {
        console.error(`Ping error for ${url}:`, error);
        resolve(false);
      });
      request.end();
    });
  } catch (error) {
    console.error('Unexpected error in ping-host:', error);
    return false;
  }
});
