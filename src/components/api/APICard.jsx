import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabase } from '../../contexts/SupabaseContext';

const { 
  FiGlobe, FiZap, FiDatabase, FiSettings, FiActivity, FiShield,
  FiPlay, FiEdit3, FiTrash2, FiEye, FiEyeOff, FiClock, FiCheckCircle, FiXCircle
} = FiIcons;

const APICard = ({ integration, onUpdate, onTest, onEdit }) => {
  const { supabase } = useSupabase();
  const [showDetails, setShowDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const getTypeIcon = (type) => {
    const icons = {
      'webhook': FiZap,
      'rest_api': FiGlobe,
      'crm': FiDatabase,
      'email': FiSettings,
      'social': FiActivity,
      'analytics': FiShield
    };
    return icons[type] || FiGlobe;
  };

  const getStatusColor = (status) => {
    const colors = {
      'active': 'text-green-400 bg-green-900/20',
      'inactive': 'text-gray-400 bg-gray-900/20',
      'testing': 'text-yellow-400 bg-yellow-900/20',
      'error': 'text-red-400 bg-red-900/20'
    };
    return colors[status] || 'text-gray-400 bg-gray-900/20';
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000); // Reset after 3 seconds
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('api_integrations_ax2024')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;
      onUpdate();
    } catch (error) {
      console.error('Error deleting integration:', error);
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const toggleStatus = async () => {
    const newStatus = integration.status === 'active' ? 'inactive' : 'active';
    
    try {
      const { error } = await supabase
        .from('api_integrations_ax2024')
        .update({ status: newStatus })
        .eq('id', integration.id);

      if (error) throw error;
      onUpdate();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-lg p-6 hover:bg-white/10 transition-all duration-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <SafeIcon icon={getTypeIcon(integration.type)} className="text-white text-xl" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-1">
              <h3 className="text-lg font-semibold text-white">{integration.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(integration.status)}`}>
                {integration.status.toUpperCase()}
              </span>
            </div>
            
            <p className="text-sm text-slate-400 mb-2">
              {integration.metadata?.description || `${integration.type.replace('_', ' ').toUpperCase()} integration`}
            </p>
            
            <div className="flex items-center space-x-4 text-xs text-slate-500">
              <span>Type: {integration.type.replace('_', ' ')}</span>
              <span>•</span>
              <span>Endpoints: {integration.endpoints?.length || 0}</span>
              <span>•</span>
              <span>Last tested: {formatDate(integration.last_tested_at)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowDetails(!showDetails)}
            className="p-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg transition-colors"
            title="Toggle details"
          >
            <SafeIcon icon={showDetails ? FiEyeOff : FiEye} className="text-slate-300" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onEdit(integration)}
            className="p-2 bg-yellow-600/20 hover:bg-yellow-600/30 rounded-lg transition-colors"
            title="Edit API"
          >
            <SafeIcon icon={FiEdit3} className="text-yellow-400" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onTest(integration)}
            className="p-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg transition-colors"
            title="Test API"
          >
            <SafeIcon icon={FiPlay} className="text-blue-400" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleStatus}
            className={`p-2 rounded-lg transition-colors ${
              integration.status === 'active' 
                ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                : 'bg-green-600/20 hover:bg-green-600/30 text-green-400'
            }`}
            title={integration.status === 'active' ? 'Deactivate' : 'Activate'}
          >
            <SafeIcon icon={integration.status === 'active' ? FiXCircle : FiCheckCircle} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={isDeleting}
            className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
              confirmingDelete
                ? 'bg-red-500 text-white'
                : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
            }`}
            title={confirmingDelete ? 'Confirm Deletion' : 'Delete Integration'}
          >
            <SafeIcon icon={FiTrash2} />
          </motion.button>
        </div>
      </div>

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-onyx-accent/20"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Configuration</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Base URL:</span>
                  <span className="text-slate-300 font-mono text-xs">{integration.base_url || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auth Type:</span>
                  <span className="text-slate-300">{integration.auth_type || 'API Key'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Rate Limit:</span>
                  <span className="text-slate-300">{integration.rate_limit || 1000}/hour</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timeout:</span>
                  <span className="text-slate-300">{integration.timeout_seconds || 30}s</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Available Endpoints</h4>
              {integration.endpoints && integration.endpoints.length > 0 ? (
                <div className="space-y-1">
                  {integration.endpoints.slice(0, 3).map((endpoint, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-mono ${
                        endpoint.method === 'GET' ? 'bg-green-900/30 text-green-400' :
                        endpoint.method === 'POST' ? 'bg-blue-900/30 text-blue-400' :
                        endpoint.method === 'PUT' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-red-900/30 text-red-400'
                      }`}>
                        {endpoint.method}
                      </span>
                      <span className="text-slate-400 font-mono text-xs">{endpoint.name}</span>
                    </div>
                  ))}
                  {integration.endpoints.length > 3 && (
                    <div className="text-xs text-slate-500">
                      +{integration.endpoints.length - 3} more endpoints
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No endpoints configured</p>
              )}
            </div>
          </div>

          {integration.test_result && (
            <div className="mt-4 pt-4 border-t border-onyx-accent/20">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Last Test Result</h4>
              <div className={`p-3 rounded-lg text-sm ${
                integration.test_result.success 
                  ? 'bg-green-900/20 border border-green-800/30 text-green-300'
                  : 'bg-red-900/20 border border-red-800/30 text-red-300'
              }`}>
                <div className="flex items-center space-x-2 mb-1">
                  <SafeIcon icon={integration.test_result.success ? FiCheckCircle : FiXCircle} />
                  <span className="font-medium">
                    {integration.test_result.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                </div>
                {integration.test_result.message && (
                  <p className="text-xs opacity-80">{integration.test_result.message}</p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default APICard;