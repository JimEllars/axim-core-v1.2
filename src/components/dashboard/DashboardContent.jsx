import React from 'react';
import { motion } from 'framer-motion';
import MetricsGrid from './MetricsGrid';
import ActionPanel from './ActionPanel';
import ContactManager from './ContactManager';
import VisualizationPanel from './VisualizationPanel';
import EventLog from './EventLog';
import RecentWorkflows from './RecentWorkflows';
import GenerativeAIPanel from './GenerativeAIPanel';
import AIInteractionsChart from './AIInteractionsChart';
import FleetStatusMap from './FleetStatusMap';
import SystemAutonomyMap from './SystemAutonomyMap';
import JulesStatusPanel from './JulesStatusPanel';
import CloudflareEdgeHealth from './CloudflareEdgeHealth';
import JobQueueMonitor from './JobQueueMonitor';

import { useDashboard } from '../../contexts/DashboardContext';
import { FiRefreshCw, FiTerminal } from 'react-icons/fi';
import toast from 'react-hot-toast';

const DashboardContent = () => {
  const { refreshDashboard, activeJulesSessionId } = useDashboard();

  const handleRefresh = () => {
    refreshDashboard();
    toast.success('Dashboard data refreshed.');
  };

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1600px] mx-auto min-h-[calc(100vh-80px)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full h-full flex flex-col gap-6"
      >
        <div className="flex justify-between items-center bg-onyx-900/50 p-4 rounded-xl border border-onyx-accent/20 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
             <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
             <h1 className="text-2xl font-bold text-white tracking-wide">Command Center</h1>
          </div>
          <div className="flex space-x-4">
             {activeJulesSessionId && (
               <div className="flex items-center space-x-2 text-indigo-400 bg-indigo-900/20 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                 <FiTerminal className="animate-pulse" />
                 <span className="text-sm font-mono tracking-wider text-xs">Jules Active</span>
               </div>
             )}
             <button
               onClick={handleRefresh}
               className="p-2 rounded-lg bg-onyx-800 text-slate-300 hover:text-white hover:bg-onyx-700 transition-colors border border-onyx-accent/30"
               aria-label="Refresh Dashboard"
             >
               <FiRefreshCw />
             </button>
          </div>
        </div>

        <MetricsGrid />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <FleetStatusMap />
            <JobQueueMonitor />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow">
                <VisualizationPanel />
                <GenerativeAIPanel />
            </div>
            {activeJulesSessionId && (
               <JulesStatusPanel />
            )}
            <AIInteractionsChart />
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6">
            <CloudflareEdgeHealth />
            <SystemAutonomyMap />
            <ActionPanel />
            <RecentWorkflows />
            <EventLog />
            <ContactManager />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardContent;
