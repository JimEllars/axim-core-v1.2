import React from 'react';
import { FiAlertCircle } from 'react-icons/fi';

const DegradedModeAlert = () => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center bg-amber-900/40 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-full shadow-lg backdrop-blur-sm animate-pulse">
      <FiAlertCircle className="mr-2" />
      <span className="text-sm font-medium">Degraded Network / Reconnecting...</span>
    </div>
  );
};

export default DegradedModeAlert;
