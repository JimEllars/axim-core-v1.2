import React from 'react';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiAlertTriangle, FiCloud } = FiIcons;

const CommandHubHeader = () => {
  const { edgeCapacity, edgeDegraded } = useConnectivity();

  return (
    <div className="mb-6 flex justify-between items-start">
      <div>
        <h1 className="text-3xl font-bold text-white">Onyx Command Hub</h1>
        <p className="text-slate-400">Your AI-powered command and control center.</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {edgeDegraded && (
          <div className="flex items-center space-x-2 text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
            <SafeIcon icon={FiAlertTriangle} className="animate-pulse" />
            <span className="text-sm font-semibold">Edge Degraded - Active Fallbacks</span>
          </div>
        )}
        {edgeCapacity && (
           <div className="flex items-center space-x-2 text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
             <SafeIcon icon={FiCloud} />
             <span className="text-sm font-semibold">{edgeCapacity} req/m</span>
           </div>
        )}
      </div>
    </div>
  );
};

export default CommandHubHeader;
