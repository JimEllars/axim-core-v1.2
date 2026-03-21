import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';
import providerManager from '../../services/onyxAI/providerManager';

const ApiKeyManager = ({ user }) => {
  const [apiKeys, setApiKeys] = useState([]);
  const [newApiKey, setNewApiKey] = useState({ service: '', api_key: '' });
  const [editingKey, setEditingKey] = useState(null);
  const [availableProviders, setAvailableProviders] = useState([]);

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
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      toast.error('Error fetching API keys.');
    } else {
      setApiKeys(data || []);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewApiKey({ ...newApiKey, [name]: value });
  };

  const handleAddApiKey = async (e) => {
    e.preventDefault();
    if (!newApiKey.service) {
      toast.error("Please select a service.");
      return;
    }
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ ...newApiKey, user_id: user.id });

    if (error) {
      toast.error('Error adding API key.');
    } else {
      setApiKeys([...apiKeys, ...data]);
      setNewApiKey({ service: availableProviders[0] || '', api_key: '' });
      toast.success('API key added successfully.');
      fetchApiKeys();
    }
  };

  const handleEditApiKey = async (apiKey) => {
    const { data, error } = await supabase
      .from('api_keys')
      .update({ api_key: apiKey.api_key, service: apiKey.service })
      .eq('id', apiKey.id);

    if (error) {
      toast.error('Error updating API key.');
    } else {
      toast.success('API key updated successfully.');
      setEditingKey(null);
      fetchApiKeys();
    }
  };

  const handleDeleteApiKey = async (id) => {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error deleting API key.');
    } else {
      setApiKeys(apiKeys.filter((key) => key.id !== id));
      toast.success('API key deleted successfully.');
    }
  };

  return (
    <div className="bg-onyx-950 p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">API Key Management</h2>
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
                      value={key.service}
                      onChange={(e) => setApiKeys(apiKeys.map(k => k.id === key.id ? {...k, service: e.target.value} : k))}
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
                      value={key.api_key}
                      onChange={(e) => setApiKeys(apiKeys.map(k => k.id === key.id ? {...k, api_key: e.target.value} : k))}
                      className="input input-bordered w-full bg-onyx-950"
                    />
                  ) : (
                    '••••••••••••••••'
                  )}
                </td>
                <td>
                  {editingKey === key.id ? (
                    <button onClick={() => handleEditApiKey(key)} className="btn btn-sm btn-success">Save</button>
                  ) : (
                    <button onClick={() => setEditingKey(key.id)} className="btn btn-sm btn-info">Edit</button>
                  )}
                  <button onClick={() => handleDeleteApiKey(key.id)} className="btn btn-sm btn-danger ml-2">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ApiKeyManager;