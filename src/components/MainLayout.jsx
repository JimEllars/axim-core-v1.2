import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useState } from 'react';
import Sidebar from './Sidebar';
import OfflineIndicator from './common/OfflineIndicator';
import CommandBar from './layout/CommandBar';
import WidgetDrawer from './layout/WidgetDrawer';
import IntelligenceSearchModal from './layout/IntelligenceSearchModal';

// The global `window.electronAPI` is exposed by the preload script.
const isElectron = !!window.electronAPI;

/**
 * Renders the main layout for the application, including the sidebar and content area.
 * Handles Electron-specific auto-update events to provide user feedback.
 */
function MainLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Use a ref to store the toast ID, so it can be updated or dismissed.
  const updateToastId = useRef(null);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isElectron) return;

    // Handler for general update status messages (e.g., checking, downloading)
    const handleUpdateStatus = (event, message) => {
      console.log('Update Status:', message);

      // If a toast is not already shown, create one.
      if (!updateToastId.current) {
        updateToastId.current = toast.loading(message, {
          duration: Infinity, // This toast will persist until dismissed
        });
      } else {
        // If a toast is already visible, just update its content.
        toast.loading(message, {
          id: updateToastId.current,
          duration: Infinity,
        });
      }
    };

    // Handler for when an update is downloaded and ready to be installed
    const handleUpdateDownloaded = () => {
      // First, dismiss the 'downloading...' toast if it exists.
      if (updateToastId.current) {
        toast.dismiss(updateToastId.current);
        updateToastId.current = null;
      }

      // Then, show the success toast with the restart button.
      toast.success(
        (t) => (
          <div className="flex flex-col items-center gap-2">
            <span>Update ready to install.</span>
            <button
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700"
              onClick={() => {
                window.electronAPI.send('restart-app');
                toast.dismiss(t.id);
              }}
            >
              Restart and Install
            </button>
          </div>
        ),
        {
          duration: Infinity, // Keep the toast open until the user interacts with it
        }
      );
    };

    // Use the secure API exposed on the window object
    const unsubscribeStatus = window.electronAPI.on('update-status', handleUpdateStatus);
    const unsubscribeDownloaded = window.electronAPI.on('update-downloaded', handleUpdateDownloaded);

    // Cleanup the listeners when the component unmounts
    return () => {
      if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
      if (typeof unsubscribeDownloaded === 'function') unsubscribeDownloaded();
    };
  }, []);

  return (
    <div className="flex min-h-screen cyber-grid bg-onyx-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col relative">
        <div className="flex-1 overflow-auto pb-24">
          <Outlet />
        </div>
        <div className="absolute bottom-0 w-full z-50">
          <CommandBar />
        </div>
        <WidgetDrawer />
      </main>
      <OfflineIndicator />
      <IntelligenceSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}

export default MainLayout;
