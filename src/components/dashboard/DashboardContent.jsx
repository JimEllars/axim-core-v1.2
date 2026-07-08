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
import { useDashboard } from '../../contexts/DashboardContext';
import { FiRefreshCw, FiTerminal } from 'react-icons/fi';
import toast from 'react-hot-toast';

const DashboardContent = () => {
  const { refreshDashboard } = useDashboard();

  const handleRefresh = () => {
    refreshDashboard();
    toast.success('Dashboard data refreshed.');
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
      >
        {/* Header */}
        <div className="lg:col-span-3 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <FiTerminal className="text-blue-500" />
              Unified Command Terminal
            </h1>
            <p className="text-slate-400 font-mono text-sm tracking-wider uppercase">Active State Monitoring & Ecosystem Aggregation</p>
          </div>
          <button
            onClick={handleRefresh}
            className="glass-effect p-2 rounded-full text-slate-300 hover:text-white hover:bg-onyx-accent/20 transition-colors"
            aria-label="Refresh Dashboard"
          >
            <FiRefreshCw className="w-6 h-6" />
          </button>
        </div>

        {/* Metrics Overview - Unified Command Terminal Indicators */}
        <div className="lg:col-span-3">
          <MetricsGrid />
        </div>

        {/* Fleet Map Overview */}
        <div className="lg:col-span-2">
          <FleetStatusMap />
        </div>

        {/* System Autonomy Map */}
        <div className="lg:col-span-1">
          <SystemAutonomyMap />
        </div>

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          <ActionPanel />
          <VisualizationPanel />
          <ContactManager />
        </div>

        {/* Right Column */}
        <div className="lg:col-span-1 space-y-8">
          <RecentWorkflows />
          <GenerativeAIPanel />
          <EventLog />
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardContent;
