import React, { useState, useEffect } from 'react';
import supabaseApiService from '../../services/supabaseApiService';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiKey, FiTrash2, FiPlus, FiAlertCircle, FiLoader } = FiIcons;

const ApiKeyManager = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [newKeyValue, setNewKeyValue] = useState(null);

  useEffect(() => {
    if (user?.id) {
      loadKeys();
    }
  }, [user]);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseApiService.supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKeys(data || []);
    } catch (err) {
      toast.error('Failed to load API keys');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    setGenerating(true);
    setNewKeyValue(null);
    try {
      const { data, error } = await supabaseApiService.supabase.functions.invoke('issue-api-key');

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setKeys([{ id: data.id, created_at: data.created_at, display_key: data.display_key }, ...keys]);
      setNewKeyValue(data.key);
      toast.success('API Key generated successfully.');
    } catch (err) {
      toast.error('Failed to generate API key');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeKey = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    setRevoking(id);
    try {
      const { error } = await supabaseApiService.supabase
        .from('api_keys')
        .delete()
        .match({ id });

      if (error) throw error;

      setKeys(keys.filter(k => k.id !== id));
      toast.success('API Key revoked');
    } catch (err) {
      toast.error('Failed to revoke API key');
      console.error(err);
    } finally {
      setRevoking(null);
    }
  };

  const maskKey = (keyString) => {
    if (!keyString || typeof keyString !== 'string') return '****************';
    if (keyString.length <= 4) return keyString;
    return '****************' + keyString.slice(-4);
  };

  return (
    <div className="bg-onyx-950 border border-onyx-accent/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center">
            <SafeIcon icon={FiKey} className="mr-3 text-indigo-400" />
            API Key Manager
          </h3>
          <p className="text-sm text-slate-400 mt-1">Manage access keys for micro-apps and integrations</p>
        </div>
        <button
          onClick={handleGenerateKey}
          disabled={generating}
          className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {generating ? (
            <SafeIcon icon={FiLoader} className="animate-spin mr-2" />
          ) : (
            <SafeIcon icon={FiPlus} className="mr-2" />
          )}
          Generate New Key
        </button>
      </div>

      {newKeyValue && (
        <div className="mb-6 p-4 bg-indigo-900/30 border border-indigo-500/50 rounded-lg">
          <h4 className="text-indigo-400 font-bold flex items-center mb-2">
            <SafeIcon icon={FiAlertCircle} className="mr-2" />
            Please copy your API key now
          </h4>
          <p className="text-sm text-slate-300 mb-3">
            For your security, it will not be shown again. If you lose it, you will need to generate a new one.
          </p>
          <div className="flex items-center">
            <code className="flex-1 bg-onyx-950 p-3 rounded border border-onyx-accent/20 text-indigo-300 font-mono select-all">
              {newKeyValue}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKeyValue);
                toast.success('Copied to clipboard');
              }}
              className="ml-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors text-sm"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <SafeIcon icon={FiLoader} className="animate-spin text-indigo-400 text-2xl" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 bg-onyx-900/30 rounded-lg border border-dashed border-onyx-accent/20">
          <SafeIcon icon={FiAlertCircle} className="text-slate-500 text-3xl mx-auto mb-3" />
          <p className="text-slate-400">No API keys found. Generate one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-onyx-accent/20">
                <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Key</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-onyx-accent/10">
              <AnimatePresence>
                {keys.map((k) => (
                  <motion.tr
                    key={k.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-onyx-900/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <code className="text-sm text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded">
                        {k.display_key || maskKey(k.api_key || k.key)}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRevokeKey(k.id)}
                        disabled={revoking === k.id}
                        className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded transition-colors disabled:opacity-50"
                        title="Revoke Key"
                      >
                        {revoking === k.id ? (
                          <SafeIcon icon={FiLoader} className="animate-spin" />
                        ) : (
                          <SafeIcon icon={FiTrash2} />
                        )}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
