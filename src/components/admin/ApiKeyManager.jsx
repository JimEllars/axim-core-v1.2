import React, { useState, useEffect } from 'react';
import supabaseApiService from '../../services/supabaseApiService';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiKey, FiTrash2, FiPlus, FiAlertCircle, FiLoader, FiCopy, FiRefreshCw, FiEye, FiEyeOff } = FiIcons;

const ApiKeyManager = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [rotating, setRotating] = useState(null);
  const [newKeyValue, setNewKeyValue] = useState(null);
  const [showKeyId, setShowKeyId] = useState(null); // ID of key to show full value for (if we had it, but mostly they are hashed. We just show partial)

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

  const handleRotateKey = async (id) => {
    if (!window.confirm('Are you sure you want to rotate this API key? Applications using the old key will lose access immediately.')) {
      return;
    }

    setRotating(id);
    setNewKeyValue(null);
    try {
      // Simulate rotating via invoking endpoint that handles it
      const { data, error } = await supabaseApiService.supabase.functions.invoke('rotate-api-key', {
          body: { key_id: id }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Refresh list to get new key metadata
      await loadKeys();
      setNewKeyValue(data.new_key);
      toast.success('API Key rotated successfully.');
    } catch (err) {
      toast.error('Failed to rotate API key. Make sure the edge function exists.');
      console.error(err);
    } finally {
      setRotating(null);
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

  const maskKey = (keyString, isVisible) => {
    if (!keyString || typeof keyString !== 'string') return 'sk_live_••••••••••••';
    if (isVisible) return keyString; // Normally backend doesn't return full key, but if it does
    const prefix = 'sk_live_';
    if (keyString.startsWith(prefix)) {
       return prefix + '••••••••••••' + keyString.slice(-4);
    }
    if (keyString.length <= 4) return '••••' + keyString;
    return 'sk_live_••••••••••••' + keyString.slice(-4);
  };

  const toggleVisibility = (id) => {
      setShowKeyId(showKeyId === id ? null : id);
  };

  return (
    <div className="bg-slate-950 border border-cyan-900/40 rounded-xl p-6 shadow-[0_0_15px_rgba(8,145,178,0.05)] text-slate-200">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-semibold text-cyan-50 flex items-center tracking-tight">
            <SafeIcon icon={FiKey} className="mr-3 text-cyan-400" />
            Ecosystem API Keys
          </h3>
          <p className="text-sm text-slate-400 mt-1">Manage secure cryptographic access tokens for the AXiM edge fleet.</p>
        </div>
        <button
          onClick={handleGenerateKey}
          disabled={generating}
          className="flex items-center px-4 py-2 bg-cyan-600/20 border border-cyan-500/50 hover:bg-cyan-500/30 text-cyan-300 text-sm font-medium rounded-md transition-all duration-200 shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <SafeIcon icon={FiLoader} className="animate-spin mr-2" />
          ) : (
            <SafeIcon icon={FiPlus} className="mr-2" />
          )}
          Generate Token
        </button>
      </div>

      <AnimatePresence>
      {newKeyValue && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mb-8 p-5 bg-cyan-950/30 border border-cyan-500/50 rounded-lg backdrop-blur-sm relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400"></div>
          <h4 className="text-cyan-300 font-bold flex items-center mb-2 tracking-wide">
            <SafeIcon icon={FiAlertCircle} className="mr-2" />
            Secure Token Generated
          </h4>
          <p className="text-sm text-slate-300 mb-4">
            This token provides direct access to the AXiM Core. Copy it immediately. For security, it will never be displayed again.
          </p>
          <div className="flex items-center bg-slate-900/80 rounded-md border border-slate-700/50 p-1">
            <code className="flex-1 px-4 py-2 text-cyan-200 font-mono tracking-wider select-all overflow-x-auto whitespace-nowrap">
              {newKeyValue}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKeyValue);
                toast.success('Token securely copied to clipboard', {
                   style: { background: '#083344', color: '#67e8f9', border: '1px solid rgba(6, 182, 212, 0.3)' }
                });
              }}
              className="ml-2 px-4 py-2 bg-cyan-800/50 hover:bg-cyan-700/60 text-cyan-100 rounded transition-colors flex items-center text-sm font-medium"
            >
              <SafeIcon icon={FiCopy} className="mr-2" />
              Copy
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <SafeIcon icon={FiLoader} className="animate-spin text-cyan-500 text-3xl" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/20 rounded-lg border border-dashed border-slate-700/50">
          <SafeIcon icon={FiKey} className="text-slate-600 text-4xl mx-auto mb-4 opacity-50" />
          <p className="text-slate-400 font-medium">No active tokens found.</p>
          <p className="text-slate-500 text-sm mt-1">Generate a secure token to authenticate edge micro-apps.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800">
                <th className="py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-widest">Secret Token</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-widest">Created / Issued</th>
                <th className="py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-widest text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
              <AnimatePresence>
                {keys.map((k) => {
                  const isVisible = showKeyId === k.id;
                  const displayValue = k.display_key || maskKey(k.api_key || k.key, isVisible);
                  return (
                    <motion.tr
                      key={k.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      <td className="py-4 px-5">
                        <div className="flex items-center">
                          <code className="text-sm text-cyan-300 font-mono tracking-widest bg-cyan-950/40 px-3 py-1.5 rounded-md border border-cyan-900/50">
                            {displayValue}
                          </code>
                          {/* Only show eye icon if we actually have the full key to show, usually we only have display_key */}
                          {(!k.display_key && k.api_key) && (
                            <button
                                onClick={() => toggleVisibility(k.id)}
                                className="ml-3 text-slate-500 hover:text-cyan-400 transition-colors"
                            >
                                <SafeIcon icon={isVisible ? FiEyeOff : FiEye} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-sm text-slate-400 font-medium">
                        {new Date(k.created_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        })}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex justify-end space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                                navigator.clipboard.writeText(displayValue);
                                toast.success('Key identifier copied');
                            }}
                            className="p-2 text-slate-400 hover:bg-slate-700/50 hover:text-cyan-300 rounded-md transition-colors"
                            title="Copy Identifier"
                          >
                            <SafeIcon icon={FiCopy} />
                          </button>
                          <button
                            onClick={() => handleRotateKey(k.id)}
                            disabled={rotating === k.id || revoking === k.id}
                            className="p-2 text-slate-400 hover:bg-amber-500/20 hover:text-amber-300 rounded-md transition-colors disabled:opacity-50"
                            title="Rotate Key"
                          >
                            {rotating === k.id ? (
                              <SafeIcon icon={FiLoader} className="animate-spin" />
                            ) : (
                              <SafeIcon icon={FiRefreshCw} />
                            )}
                          </button>
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            disabled={revoking === k.id || rotating === k.id}
                            className="p-2 text-slate-400 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-colors disabled:opacity-50"
                            title="Revoke Key"
                          >
                            {revoking === k.id ? (
                              <SafeIcon icon={FiLoader} className="animate-spin" />
                            ) : (
                              <SafeIcon icon={FiTrash2} />
                            )}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
