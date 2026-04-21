import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import providerManager from '../../services/onyxAI/providerManager';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ApiKeyManager = ({ user }) => {
  const queryClient = useQueryClient();
  const [newApiKey, setNewApiKey] = useState({ service: '', api_key: '' });
  const [editingKey, setEditingKey] = useState(null);
  const [availableProviders, setAvailableProviders] = useState([]);

  // New state for API Side Door keys (axm_live_...)
  const [newB2BKeyName, setNewB2BKeyName] = useState('');

  // Fetch API Keys
  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery({
    queryKey: ['api_keys', user.id],
    queryFn: async () => {
      const data = await api.getApiKeys(user.id);
      const error = null;
      if (error) throw error;
      return data;
    }
  });

  // Fetch Partner Credits
  const { data: partnerCredit, isLoading: isLoadingCredits } = useQuery({
    queryKey: ['partner_credits', user.id],
    queryFn: async () => {
      const data = await api.getPartnerCredit(user.id);
      const error = null;
      if (error) throw error;
      return data;
    }
  });

  // Fetch API Key Usage
  const { data: usageLogs = [] } = useQuery({
    queryKey: ['api_usage_logs', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  const generateB2BKeyMutation = useMutation({
    mutationFn: async (serviceName) => {
      // Key generated in API service
      const data = await api.generateB2BApiKey(serviceName, user.id);
      const error = null;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('B2B API key generated successfully.');
      setNewB2BKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api_keys', user.id] });
    },
    onError: () => toast.error('Error generating B2B API key.')
  });

  const addApiKeyMutation = useMutation({
    mutationFn: async (keyData) => {
      const data = await api.addApiKey(keyData, user.id);
      const error = null;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('API key added successfully.');
      setNewApiKey({ service: availableProviders[0] || '', api_key: '' });
      queryClient.invalidateQueries({ queryKey: ['api_keys', user.id] });
    },
    onError: () => toast.error('Error adding API key.')
  });

  const updateApiKeyMutation = useMutation({
    mutationFn: async (apiKey) => {
      const data = await api.updateApiKey(apiKey);
      const error = null;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('API key updated successfully.');
      setEditingKey(null);
      queryClient.invalidateQueries({ queryKey: ['api_keys', user.id] });
    },
    onError: () => toast.error('Error updating API key.')
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id) => {
      await api.deleteApiKey(id);
      const error = null;
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success('API key revoked successfully.');
      queryClient.invalidateQueries({ queryKey: ['api_keys', user.id] });
    },
    onError: () => toast.error('Error revoking API key.')
  });

  useEffect(() => {
    const initializeProviders = async () => {
      await providerManager.loadProviders();
      const providers = providerManager.getAvailableProviders();
      setAvailableProviders(providers);
      if (providers.length > 0) {
        setNewApiKey(prev => ({ ...prev, service: providers[0] }));
      }
    };

    initializeProviders();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewApiKey({ ...newApiKey, [name]: value });
  };

  const handleAddApiKey = (e) => {
    e.preventDefault();
    if (!newApiKey.service) {
      toast.error("Please select a service.");
      return;
    }
    addApiKeyMutation.mutate(newApiKey);
  };

  const handleEditApiKey = (apiKey) => {
    updateApiKeyMutation.mutate(apiKey);
  };

  const handleDeleteApiKey = (id) => {
    deleteApiKeyMutation.mutate(id);
  };

  const handleGenerateB2BKey = (e) => {
    e.preventDefault();
    generateB2BKeyMutation.mutate(newB2BKeyName);
  };

  return (
    <div className="space-y-6">
      <div className="bg-onyx-950 p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4">API Key Management (B2B API Side Door)</h2>
        <div className="mb-6 bg-onyx-900/50 p-4 rounded-lg border border-onyx-accent/20">
          <h3 className="text-md font-semibold mb-2">Generate B2B API Key</h3>
          <form onSubmit={handleGenerateB2BKey} className="flex gap-4">
            <input
              type="text"
              value={newB2BKeyName}
              onChange={(e) => setNewB2BKeyName(e.target.value)}
              placeholder="Key Name (e.g. AXiM Side Door)"
              className="input input-bordered flex-1 bg-onyx-950"
            />
            <button type="submit" className="btn btn-primary" disabled={generateB2BKeyMutation.isPending}>
              Generate Key
            </button>
          </form>
        </div>
      </div>

      {partnerCredit && (
        <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6 border border-onyx-accent/20">
          <h2 className="text-xl font-bold mb-2">Partner API Credits</h2>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Credits Remaining:</span>
            <span className="text-2xl font-bold text-green-400">{partnerCredit.credits_remaining}</span>
          </div>
          {/* Note: Top-up logic could be added here or via Billing Portal */}
        </div>
      )}

      <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6">
        <h3 className="text-lg font-bold mb-4">Add Provider Key</h3>
      <form onSubmit={handleAddApiKey} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            name="service"
            value={newApiKey.service}
            onChange={handleInputChange}
            className="select select-bordered w-full bg-onyx-950"
            required
          >
            <option value="" disabled>Select a provider</option>
            {availableProviders.map(provider => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>
          <input
            type="password"
            name="api_key"
            value={newApiKey.api_key}
            onChange={handleInputChange}
            placeholder="API Key"
            className="input input-bordered w-full bg-onyx-950"
            required
          />
          <button type="submit" className="btn btn-primary">Add Key</button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Service</th>
              <th>API Key</th>
              <th>Tier</th>
              <th>Rate Limit (RPM)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <td>
                  {editingKey === key.id ? (
                    <input
                      type="text"
                      defaultValue={key.service}
                      onChange={(e) => key.service = e.target.value}
                      className="input input-bordered w-full bg-onyx-950"
                    />
                  ) : (
                    key.service
                  )}
                </td>
                <td>
                  {editingKey === key.id ? (
                    <input
                      type="text"
                      defaultValue={key.api_key}
                      onChange={(e) => key.api_key = e.target.value}
                      className="input input-bordered w-full bg-onyx-950"
                    />
                  ) : (
                    key.api_key.startsWith('axm_live_') ? key.api_key : '••••••••••••••••'
                  )}
                </td>
                <td>
                  {editingKey === key.id ? (
                    <input
                      type="text"
                      defaultValue={key.tier || 'standard'}
                      onChange={(e) => key.tier = e.target.value}
                      className="input input-bordered w-full bg-onyx-950"
                    />
                  ) : (
                    key.tier || 'standard'
                  )}
                </td>
                <td>
                  {editingKey === key.id ? (
                    <input
                      type="number"
                      defaultValue={key.rate_limit || 100}
                      onChange={(e) => key.rate_limit = parseInt(e.target.value, 10)}
                      className="input input-bordered w-full bg-onyx-950"
                    />
                  ) : (
                    key.rate_limit || 100
                  )}
                </td>
                <td>
                  {editingKey === key.id ? (
                    <button onClick={() => handleEditApiKey(key)} className="btn btn-sm btn-success">Save</button>
                  ) : (
                    <button onClick={() => setEditingKey(key.id)} className="btn btn-sm btn-info">Edit</button>
                  )}
                  <button onClick={() => handleDeleteApiKey(key.id)} className="btn btn-sm btn-danger ml-2">Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold mb-4">Recent Usage Logs</h3>
        {usageLogs.length === 0 ? (
            <p className="text-slate-400">No recent usage found.</p>
        ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {usageLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td>{log.endpoint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </div>

    </div>
    </div>
  );
};

export default ApiKeyManager;
