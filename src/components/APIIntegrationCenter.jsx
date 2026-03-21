import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useSupabase } from '../contexts/SupabaseContext';
import onyxAI from '../services/onyxAI';
import api from '../services/onyxAI/api';
import APICard from './api/APICard';
import APISetupWizard from './api/APISetupWizard';
import APITestConsole from './api/APITestConsole';
import AIAssistant from './api/AIAssistant';

const { 
  FiPlus, FiSettings, FiActivity, FiZap, FiDatabase, 
  FiGlobe, FiShield, FiCpu, FiRefreshCw 
} = FiIcons;

const APIIntegrationCenter = () => {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('overview'); // overview, wizard, test, ai-assistant
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [stats, setStats] = useState({
    totalIntegrations: 0,
    activeIntegrations: 0,
    totalCalls: 0,
    successRate: 0
  });
  const { supabase } = useSupabase();

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const { integrations: data, stats: newStats } = await api.getIntegrationsWithStats();
      setIntegrations(data || []);
      setStats(newStats);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (supabase) {
      fetchIntegrations();
    }
  }, [supabase]);

  const handleIntegrationUpdate = () => {
    fetchIntegrations();
    setActiveView('overview');
  };

  const handleEdit = (integration) => {
    setSelectedIntegration(integration);
    setActiveView('wizard');
  };

  const apiTypes = [
    { id: 'webhook', name: 'Webhooks', icon: FiZap, color: 'text-yellow-400' },
    { id: 'rest_api', name: 'REST APIs', icon: FiGlobe, color: 'text-blue-400' },
    { id: 'crm', name: 'CRM Systems', icon: FiDatabase, color: 'text-green-400' },
    { id: 'email', name: 'Email Services', icon: FiSettings, color: 'text-purple-400' },
    { id: 'social', name: 'Social Media', icon: FiActivity, color: 'text-pink-400' },
    { id: 'analytics', name: 'Analytics', icon: FiShield, color: 'text-orange-400' }
  ];

  const statCards = [
    {
      title: 'Total Integrations',
      value: stats.totalIntegrations,
      icon: FiGlobe,
      color: 'from-blue-500 to-cyan-600'
    },
    {
      title: 'Active Connections',
      value: stats.activeIntegrations,
      icon: FiActivity,
      color: 'from-green-500 to-emerald-600'
    },
    {
      title: 'API Calls Made',
      value: stats.totalCalls.toLocaleString(),
      icon: FiZap,
      color: 'from-yellow-500 to-orange-600'
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate}%`,
      icon: FiShield,
      color: 'from-purple-500 to-pink-600'
    }
  ];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">API Integration Center</h1>
            <p className="text-slate-400">Connect and manage external APIs with AI assistance</p>
          </div>

          <div className="flex items-center space-x-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveView('ai-assistant')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                activeView === 'ai-assistant' 
                  ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white'
                  : 'bg-onyx-950/50 hover:bg-onyx-accent/20 text-slate-300'
              }`}
            >
              <SafeIcon icon={FiCpu} />
              <span>AI Assistant</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveView('wizard')}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              <SafeIcon icon={FiPlus} />
              <span>Add Integration</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchIntegrations}
              className="p-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg transition-colors"
            >
              <SafeIcon icon={FiRefreshCw} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
            </motion.button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-effect rounded-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}>
                  <SafeIcon icon={stat.icon} className="text-white text-xl" />
                </div>
              </div>
              
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">
                  {stat.title}
                </h3>
                <div className="text-2xl font-bold text-white">
                  {loading ? (
                    <div className="animate-pulse bg-onyx-950 h-8 w-16 rounded"></div>
                  ) : (
                    stat.value
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-2 bg-onyx-950/50 p-2 rounded-lg">
          {[
            { id: 'overview', label: 'Overview', icon: FiGlobe },
            { id: 'wizard', label: 'Setup Wizard', icon: FiSettings },
            { id: 'test', label: 'Test Console', icon: FiZap },
            { id: 'ai-assistant', label: 'AI Assistant', icon: FiCpu }
          ].map((tab) => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                activeView === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-onyx-accent/20'
              }`}
            >
              <SafeIcon icon={tab.icon} />
              <span>{tab.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Main Content */}
        <AnimatePresence mode="wait">
          {activeView === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* API Types Overview */}
              <div className="glass-effect rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-6">Supported Integration Types</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {apiTypes.map((type) => (
                    <div key={type.id} className="flex items-center space-x-3 p-4 bg-onyx-950/50 rounded-lg">
                      <SafeIcon icon={type.icon} className={`text-xl ${type.color}`} />
                      <span className="text-white font-medium">{type.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Integrations */}
              <div className="glass-effect rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-white">Active Integrations</h2>
                  <span className="text-sm text-slate-400">
                    {integrations.length} total integrations
                  </span>
                </div>

                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-onyx-950 h-20 rounded-lg"></div>
                    ))}
                  </div>
                ) : integrations.length > 0 ? (
                  <div className="space-y-4">
                    {integrations.map((integration) => (
                      <APICard
                        key={integration.id}
                        integration={integration}
                        onUpdate={handleIntegrationUpdate}
                        onTest={() => {
                          setSelectedIntegration(integration);
                          setActiveView('test');
                        }}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <SafeIcon icon={FiGlobe} className="text-4xl text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400 mb-4">No integrations configured yet</p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveView('wizard')}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
                    >
                      Set up your first integration
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeView === 'wizard' && (
            <motion.div
              key="wizard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <APISetupWizard
                onComplete={handleIntegrationUpdate}
                onCancel={() => setActiveView('overview')}
              />
            </motion.div>
          )}

          {activeView === 'test' && (
            <motion.div
              key="test"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <APITestConsole
                integrations={integrations}
                selectedIntegration={selectedIntegration}
                onIntegrationChange={setSelectedIntegration}
              />
            </motion.div>
          )}

          {activeView === 'ai-assistant' && (
            <motion.div
              key="ai-assistant"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <AIAssistant
                integrations={integrations}
                onIntegrationUpdate={handleIntegrationUpdate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default APIIntegrationCenter;
