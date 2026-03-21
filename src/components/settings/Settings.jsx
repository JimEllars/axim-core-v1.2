import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import DeviceManager from './DeviceManager';
import UpdateManager from './UpdateManager';

const { FiSave, FiSettings, FiCpu, FiShare2 } = FiIcons;

const Settings = () => {
  const { user, settings, loadUserSettings } = useAuth();
  const [aiSettings, setAiSettings] = useState({ model: 'gpt-4', temperature: 0.7 });
  const [connections, setConnections] = useState({ primaryCrm: 'salesforce' });
  const [theme, setTheme] = useState('dark');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setAiSettings(settings.ai || { model: 'gpt-4', temperature: 0.7 });
      setConnections(settings.connections || { primaryCrm: 'salesforce' });
      setTheme(settings.theme || 'dark');
    }
  }, [settings]);

  const handleSave = async () => {
    setIsLoading(true);
    toast.loading('Saving settings...');

    const newSettings = { ai: aiSettings, connections, theme };

    try {
      // This function needs to be created in api.js
      await api.saveUserSettings(user.id, newSettings);
      await loadUserSettings(user); // Refresh settings in context
      toast.dismiss();
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.dismiss();
      toast.error(`Failed to save settings: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">User Settings</h1>
          <p className="text-slate-400">Manage your application preferences.</p>
        </div>

        {/* AI Settings */}
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <SafeIcon icon={FiCpu} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">AI Settings</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="ai-model" className="block text-sm font-medium text-slate-300 mb-2">AI Model</label>
              <select
                id="ai-model"
                value={aiSettings.model}
                onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                className="w-full pl-3 pr-10 py-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
              >
                <option>gpt-4</option>
                <option>gpt-3.5-turbo</option>
                <option>claude-2</option>
              </select>
            </div>
            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-slate-300 mb-2">Temperature</label>
              <input
                type="range"
                id="temperature"
                min="0"
                max="1"
                step="0.1"
                value={aiSettings.temperature}
                onChange={(e) => setAiSettings({ ...aiSettings, temperature: parseFloat(e.target.value) })}
                className="w-full h-2 bg-onyx-950 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-right text-sm text-slate-400 mt-1">{aiSettings.temperature}</div>
            </div>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
              <SafeIcon icon={FiSettings} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">Appearance</h2>
          </div>
          <div>
            <label htmlFor="theme" className="block text-sm font-medium text-slate-300 mb-2">Theme</label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full pl-3 pr-10 py-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
            >
              <option>dark</option>
              <option>light</option>
            </select>
          </div>
        </div>

        {/* Connections */}
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg flex items-center justify-center">
              <SafeIcon icon={FiShare2} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">Connections</h2>
          </div>
          <div>
            <label htmlFor="primary-crm" className="block text-sm font-medium text-slate-300 mb-2">Primary CRM</label>
            <select
              id="primary-crm"
              value={connections.primaryCrm}
              onChange={(e) => setConnections({ ...connections, primaryCrm: e.target.value })}
              className="w-full pl-3 pr-10 py-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
            >
              <option>salesforce</option>
              <option>hubspot</option>
              <option>zoho</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg disabled:opacity-50"
          >
            <SafeIcon icon={FiSave} className="mr-2" />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </motion.button>
        </div>

        <DeviceManager />
        <UpdateManager />

      </motion.div>
    </div>
  );
};

export default Settings;