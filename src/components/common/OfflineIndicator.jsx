// src/components/common/OfflineIndicator.jsx
import React from 'react';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { FiWifiOff } from 'react-icons/fi';

const OfflineIndicator = () => {
  const isOnline = useConnectivity();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white text-center py-2 z-50 flex items-center justify-center">
      <FiWifiOff className="mr-2" />
      <span>You are currently offline. Some features may be unavailable.</span>
    </div>
  );
};

export default OfflineIndicator;
