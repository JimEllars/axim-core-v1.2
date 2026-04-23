import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/onyxAI/api.js';
import providerManager from '../../services/onyxAI/providerManager.js';
import { toast } from 'react-hot-toast';
import { supabase } from '../../services/supabaseClient.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const ApiKeyManager = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [newApiKey, setNewApiKey] = useState({
    service: '',
    api_key: '',
    environment: 'live',
    scopes: ['full_access'],
    allowed_ips: ''
  });
  const [editingKey, setEditingKey] = useState(null);
  const [usageLogs, setUsageLogs] = useState([]);
  const [partnerCredit, setPartnerCredit] = useState(null);
  const [newB2BKeyName, setNewB2BKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState(null);

  const queryClient = useQueryClient();
  const { user } = useAuth();

  const SCOPE_OPTIONS = ['read:artifacts', 'write:documents', 'full_access'];

  const { data: fetchedKeys = [] } = useQuery({
    queryKey: ['api_keys', user?.id],
    queryFn: async () => {
      const data = await api.getApiKeysForUser(user.id);
      const error = null;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  useEffect(() => {
    setApiKeys(fetchedKeys);
  }, [fetchedKeys]);

  const { data: fetchedLogs = [] } = useQuery({
    queryKey: ['api_usage_logs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  useEffect(() => {
    setUsageLogs(fetchedLogs);
  }, [fetchedLogs]);

  useQuery({
    queryKey: ['partner_credits', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_credits')
        .select('*')
        .eq('partner_id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setPartnerCredit(data);
      return data;
    },
    enabled: !!user?.id
  });

  const generateB2BKeyMutation = useMutation({
    mutationFn: async (serviceName) => {
      const data = await api.generateB2BApiKey(serviceName, user.id);
      const error = null;
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('B2B API key generated successfully.');
      setNewB2BKeyName('');
      if (data && data.length > 0 && data[0].api_key) {
         setGeneratedKey(data[0].api_key);
      }
      queryClient.invalidateQueries({ queryKey: ['api_keys', user.id] });
    },
    onError: () => toast.error('Error generating B2B API key.')
  });

  const addApiKeyMutation = useMutation({
    mutationFn: async (keyData) => {
      const formattedData = {
          ...keyData,
          allowed_ips: keyData.allowed_ips ? keyData.allowed_ips.split(',').map(ip => ip.trim()).filter(Boolean) : []
      };
      const data = await api.addApiKey(formattedData, user.id);
      const error = null;
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('API key added successfully.');
      setNewApiKey({ service: availableProviders[0] || '', api_key: '', environment: 'live', scopes: ['full_access'], allowed_ips: '' });
      if (data && data.length > 0 && data[0].api_key) {
         setGeneratedKey(data[0].api_key);
      }
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

  const handleScopeChange = (e) => {
      const value = e.target.value;
      setNewApiKey(prev => ({
          ...prev,
          scopes: prev.scopes.includes(value)
            ? prev.scopes.filter(s => s !== value)
            : [...prev.scopes, value]
      }));
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

  const handleExportLogs = async () => {
      try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error("No active session");

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-export`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                  export_type: 'api_usage'
              })
          });

          const data = await response.json();
          if (data.success && data.download_url) {
              window.open(data.download_url, '_blank');
              toast.success('Audit log export ready.');
          } else {
              throw new Error(data.error || 'Failed to export logs');
          }
      } catch (e) {
          toast.error(e.message);
      }
  };


  const { data: unbilledLogs = [] } = useQuery({
    queryKey: ['unbilled_usage_logs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .is('billed', false);

      const { data: nullBilledLogs, error: nullLogsError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .is('billed', null);

      if (error || nullLogsError) throw (error || nullLogsError);
      return [...(data || []), ...(nullBilledLogs || [])];
    },
    enabled: !!user?.id
  });

  const costPerRequest = 10.00;
  const currentEstimate = unbilledLogs.length * costPerRequest;

  return (
    <div className="space-y-6">

      {generatedKey && (
          <div className="bg-green-900/50 p-6 rounded-lg shadow-lg border border-green-500 mb-6">
              <h3 className="text-xl font-bold text-green-400 mb-2">Key Generated Successfully!</h3>
              <p className="text-sm text-slate-300 mb-4">Please copy this key now. It will not be shown again.</p>
              <div className="bg-black p-3 rounded text-green-300 break-all font-mono">
                  {generatedKey}
              </div>
              <button onClick={() => setGeneratedKey(null)} className="btn btn-sm btn-ghost mt-4">Dismiss</button>
          </div>
      )}

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
        </div>
      )}

      <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6 border border-onyx-accent/20">
        <h2 className="text-xl font-bold mb-2">Current Billing Cycle Estimate</h2>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Unbilled Requests:</span>
          <span className="text-xl font-semibold text-white">{unbilledLogs.length}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-slate-400">Estimated Cost:</span>
          <span className="text-2xl font-bold text-red-400">${currentEstimate.toFixed(2)}</span>
        </div>
        <p className="text-sm text-slate-500 mt-4">Calculated based on $costPerRequest per API document request.</p>
      </div>


      <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6">
        <h3 className="text-lg font-bold mb-4">Add Provider Key</h3>
      <form onSubmit={handleAddApiKey} className="mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <select
             name="environment"
             value={newApiKey.environment}
             onChange={handleInputChange}
             className="select select-bordered w-full bg-onyx-950"
           >
             <option value="live">Live Environment</option>
             <option value="test">Test Environment</option>
           </select>

           <input
             type="text"
             name="allowed_ips"
             value={newApiKey.allowed_ips}
             onChange={handleInputChange}
             placeholder="Allowed IPs (comma separated, leave blank for any)"
             className="input input-bordered w-full bg-onyx-950"
           />
        </div>

        <div className="bg-onyx-900 p-4 rounded">
           <p className="text-sm font-semibold mb-2">Scopes</p>
           <div className="flex gap-4">
              {SCOPE_OPTIONS.map(scope => (
                  <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        value={scope}
                        checked={newApiKey.scopes.includes(scope)}
                        onChange={handleScopeChange}
                        className="checkbox checkbox-primary checkbox-sm"
                      />
                      <span className="text-sm">{scope}</span>
                  </label>
              ))}
           </div>
        </div>

        <button type="submit" className="btn btn-primary mt-4">Add Key</button>
      </form>

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Service</th>
              <th>API Key</th>
              <th>Env / Scopes</th>
              <th>Rate Limit (RPM)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => {
               const displayKey = key.api_key.startsWith('axm_live_') || key.api_key.startsWith('axm_test_')
                  ? key.api_key.substring(0, 13) + '...'
                  : '••••••••••••••••';
               return (
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
                <td className="font-mono text-sm">
                  {displayKey}
                </td>
                <td className="text-xs">
                   <span className={`badge badge-sm ${key.environment === 'live' ? 'badge-error' : 'badge-info'}`}>{key.environment || 'live'}</span>
                   <br/>
                   <span className="text-slate-400">{(key.scopes || []).join(', ')}</span>
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
                  <button onClick={() => handleDeleteApiKey(key.id)} className="btn btn-sm btn-error ml-2">Revoke/Roll</button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Recent Usage Logs</h3>
        <button onClick={handleExportLogs} className="btn btn-sm btn-outline btn-info">Export Logs (CSV)</button>
      </div>
        {usageLogs.length === 0 ? (
            <p className="text-slate-400">No recent usage found.</p>
        ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Endpoint</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usageLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td>{log.endpoint}</td>
                      <td>
                          <span className={`badge badge-sm ${log.status_code === 200 ? 'badge-success' : 'badge-error'}`}>
                              {log.status_code || 'N/A'}
                          </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}

    </div>
    </div>
  );
};

export default ApiKeyManager;
