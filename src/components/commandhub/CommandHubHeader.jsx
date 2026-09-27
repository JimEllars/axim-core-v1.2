import React from 'react';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext'; // for checking active, or maybe edgeDegraded is enough?
// Instructions say:
// Obsidian badge with green status pulse: "DeepSeek V4.1-Flash (Active)".
// Amber badge with warning pulse upon failover: "Anthropic Claude 3.5 (Failover Active)".

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
        {edgeDegraded ? (
          <div className="flex items-center space-x-2 text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <SafeIcon icon={FiAlertTriangle} className="animate-pulse" />
            <span className="text-sm font-semibold">Anthropic Claude 3.5 (Failover Active)</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-emerald-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-semibold">DeepSeek V4.1-Flash (Active)</span>
          </div>
        )}
        {edgeCapacity && (
           <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
             <SafeIcon icon={FiCloud} />
             <span className="text-sm font-semibold">{edgeCapacity} req/m</span>
           </div>
        )}
      </div>
    </div>
  );
};

export default CommandHubHeader;
