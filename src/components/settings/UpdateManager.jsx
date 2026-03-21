import React, { useState, useEffect } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

// Electron APIs need to be required carefully as this is a renderer process
const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

const UpdateManager = () => {
  const [updateStatus, setUpdateStatus] = useState('Checking for updates on load...');
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) {
      setUpdateStatus('Updates are only available in the desktop app.');
      return;
    }

    const handleUpdateStatus = (event, message) => {
      setUpdateStatus(message);
    };

    const handleUpdateDownloaded = () => {
      setUpdateStatus('Update downloaded. Ready to install.');
      setUpdateDownloaded(true);
    };

    ipcRenderer.on('update-status', handleUpdateStatus);
    ipcRenderer.on('update-downloaded', handleUpdateDownloaded);

    // Cleanup listeners on component unmount
    return () => {
      ipcRenderer.removeListener('update-status', handleUpdateStatus);
      ipcRenderer.removeListener('update-downloaded', handleUpdateDownloaded);
    };
  }, []);

  const handleCheckForUpdates = () => {
    if (ipcRenderer) {
      setUpdateStatus('Manual update check started...');
      ipcRenderer.send('check-for-updates');
    }
  };

  const handleRestartApp = () => {
    if (ipcRenderer) {
      ipcRenderer.send('restart-app');
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold text-white mb-2">Application Updates</h3>
      <div className="flex items-center space-x-4">
        <button
          onClick={handleCheckForUpdates}
          disabled={!ipcRenderer}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          <FiRefreshCw className="mr-2" />
          Check for Updates
        </button>
        {updateDownloaded && (
          <button
            onClick={handleRestartApp}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Restart to Install
          </button>
        )}
      </div>
      <p className="text-gray-400 mt-3 text-sm italic">{updateStatus}</p>
    </div>
  );
};

export default UpdateManager;
