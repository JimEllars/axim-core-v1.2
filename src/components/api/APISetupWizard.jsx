import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabase } from '../../contexts/SupabaseContext';
import EndpointEditor from './EndpointEditor';
import CrmSetupFields from './CrmSetupFields';

const { FiSave, FiX, FiGlobe, FiKey, FiType, FiZap, FiInfo, FiShield } = FiIcons;

const APISetupWizard = ({ onComplete, onCancel, integration }) => {
  const { supabase } = useSupabase();
  const [formData, setFormData] = useState({
    name: '',
    type: 'rest_api',
    base_url: '',
    auth_type: 'api_key',
    credentials: { api_key: '' },
    status: 'active',
    metadata: '{}',
    endpoints: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (integration) {
      setFormData({
        name: integration.name || '',
        type: integration.type || 'rest_api',
        base_url: integration.base_url || '',
        auth_type: integration.auth_type || 'api_key',
        credentials: integration.credentials || { api_key: '' },
        status: integration.status || 'active',
        metadata: JSON.stringify(integration.metadata || {}, null, 2),
        endpoints: integration.endpoints || []
      });
    }
  }, [integration]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'auth_type') {
      setFormData(prev => ({
        ...prev,
        credentials: {},
        [name]: value
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCredentialChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      credentials: { ...prev.credentials, [name]: value }
    }));
  };

  const handleEndpointsChange = (endpoints) => {
    setFormData(prev => ({ ...prev, endpoints }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const submissionData = {
        ...formData,
        metadata: JSON.parse(formData.metadata)
      };

      const { data, error } = integration
        ? await supabase
            .from('api_integrations_ax2024')
            .update(submissionData)
            .eq('id', integration.id)
            .select()
        : await supabase
            .from('api_integrations_ax2024')
            .insert([submissionData])
            .select();

      if (error) throw error;
      onComplete();
    } catch (error) {
      console.error('Error saving integration:', error);
      setError('Failed to save integration. Please check your inputs and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderAuthFields = () => {
    switch (formData.auth_type) {
      case 'api_key':
        return (
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              API Key
            </label>
            <input
              type="password"
              name="api_key"
              value={formData.credentials.api_key || ''}
              onChange={handleCredentialChange}
              placeholder="Enter your API key"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      case 'bearer_token':
        return (
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              Bearer Token
            </label>
            <input
              type="password"
              name="bearer_token"
              value={formData.credentials.bearer_token || ''}
              onChange={handleCredentialChange}
              placeholder="Enter your bearer token"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      case 'oauth2':
        return (
          <>
            <div>
              <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
                <SafeIcon icon={FiKey} className="mr-2" />
                Client ID
              </label>
              <input
                type="text"
                name="client_id"
                value={formData.credentials.client_id || ''}
                onChange={handleCredentialChange}
                placeholder="Enter your Client ID"
                className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
                <SafeIcon icon={FiKey} className="mr-2" />
                Client Secret
              </label>
              <input
                type="password"
                name="client_secret"
                value={formData.credentials.client_secret || ''}
                onChange={handleCredentialChange}
                placeholder="Enter your Client Secret"
                className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-8 max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          {integration ? 'Edit API Integration' : 'New API Integration'}
        </h2>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-white">
          <SafeIcon icon={FiX} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiType} className="mr-2" />
              Integration Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Slack Webhook"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
              required
            />
        </div>
        {formData.type !== 'crm' && (
          <div>
              <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
                <SafeIcon icon={FiGlobe} className="mr-2" />
                Base URL
              </label>
              <input
                type="text"
                name="base_url"
                value={formData.base_url}
                onChange={handleChange}
                placeholder="https://api.example.com/v1"
                className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
                required={formData.type !== 'crm'}
              />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiZap} className="mr-2" />
              Integration Type
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="rest_api">REST API</option>
              <option value="webhook">Webhook</option>
              <option value="crm">CRM</option>
              <option value="email">Email</option>
              <option value="social">Social Media</option>
              <option value="analytics">Analytics</option>
            </select>
          </div>
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiShield} className="mr-2" />
              Authentication Type
            </label>
            <select
              name="auth_type"
              value={formData.auth_type}
              onChange={handleChange}
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="api_key">API Key</option>
              <option value="bearer_token">Bearer Token</option>
              <option value="oauth2">OAuth 2.0</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {formData.type === 'crm' ? (
          <CrmSetupFields
            credentials={formData.credentials}
            onCredentialChange={handleCredentialChange}
          />
        ) : renderAuthFields()}

        <div>
          <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
            <SafeIcon icon={FiInfo} className="mr-2" />
            Metadata (JSON)
          </label>
          <textarea
            name="metadata"
            value={formData.metadata}
            onChange={handleChange}
            rows={4}
            placeholder='{ "version": "1.0" }'
            className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 font-mono text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {formData.type !== 'crm' && (
          <div className="pt-4 border-t border-onyx-accent/20">
            <EndpointEditor endpoints={formData.endpoints} onChange={handleEndpointsChange} />
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end space-x-4 pt-6">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
            className="px-6 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 text-slate-300 rounded-lg transition-colors"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            disabled={isSubmitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
          >
            <SafeIcon icon={FiSave} className="inline mr-2" />
            {isSubmitting ? 'Saving...' : (integration ? 'Save Changes' : 'Create Integration')}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default APISetupWizard;