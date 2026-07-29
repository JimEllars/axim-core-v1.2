import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';
import * as FiIcons from 'react-icons/fi';

const SafeIcon = ({ icon: Icon, ...props }) => {
  return Icon ? <Icon {...props} /> : null;
};

const { FiCheckCircle, FiXCircle, FiShield, FiAlertTriangle, FiPlus, FiTrash2 } = FiIcons;

const EcosystemRegistry = () => {
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNode, setNewNode] = useState({ app_name: '', health_endpoint_url: '' });

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNodes = async () => {
    setIsLoading(true);
    try {
      const [nodesRes, logsRes] = await Promise.all([
        supabase.from('ecosystem_nodes').select('*').order('created_at', { ascending: false }),
        supabase.from('api_usage_logs').select('app_id, timestamp').order('timestamp', { ascending: false }).limit(100)
      ]);

      if (nodesRes.error) throw nodesRes.error;

      const latestHeartbeats = {};
      (logsRes.data || []).forEach(log => {
          if (!latestHeartbeats[log.app_id] || new Date(log.timestamp) > new Date(latestHeartbeats[log.app_id])) {
              latestHeartbeats[log.app_id] = log.timestamp;
          }
      });

      // Compute status based on heartbeat freshness
      const now = new Date();
      const computedNodes = (nodesRes.data || []).map(node => {
        let computedStatus = node.status;
        let lastSeen = node.last_ping;

        // Use live heartbeat if newer
        if (latestHeartbeats[node.app_name] && (!lastSeen || new Date(latestHeartbeats[node.app_name]) > new Date(lastSeen))) {
            lastSeen = latestHeartbeats[node.app_name];
            node.last_ping = lastSeen;
        }

        // If manually forced offline, keep it offline
        if (node.status !== 'offline' && lastSeen) {
            const lastPing = new Date(lastSeen);
            const diffMinutes = (now - lastPing) / (1000 * 60);
            if (diffMinutes > 15) {
                computedStatus = 'offline';
            } else if (diffMinutes > 5) {
                computedStatus = 'degraded';
            } else {
                computedStatus = 'operational';
            }
        }
        return { ...node, computedStatus };
      });
      setNodes(computedNodes);

    } catch (error) {
      console.error('Error fetching ecosystem nodes:', error);
      toast.error('Failed to load ecosystem nodes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNode = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('ecosystem_nodes')
        .insert([{
           app_name: newNode.app_name,
           health_endpoint_url: newNode.health_endpoint_url,
           status: 'operational'
        }]);
      if (error) throw error;
      toast.success('Node added successfully');
      setNewNode({ app_name: '', health_endpoint_url: '' });
      setShowAddForm(false);
      fetchNodes();
    } catch(error) {
      console.error('Error adding node:', error);
      toast.error('Failed to add node');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === 'operational' ? 'offline' : 'operational';
      if(newStatus === 'operational' && !window.confirm('Are you sure you want to manually force this node to Operational? Status should normally be heartbeat-driven.')) return;

      setNodes(nodes.map(n =>
        n.id === id ? { ...n, status: newStatus } : n
      ));

      const { error } = await supabase
        .from('ecosystem_nodes')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Node is now ${newStatus}`);
    } catch (error) {
      console.error('Error toggling node status:', error);
      toast.error('Failed to update node status');
      fetchNodes();
    }
  };

  const handleDeleteNode = async (id) => {
    if (!window.confirm('Are you sure you want to delete this node?')) return;

    try {
      const { error } = await supabase
        .from('ecosystem_nodes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setNodes(nodes.filter(n => n.id !== id));
      toast.success('Node deleted successfully');
    } catch (error) {
      console.error('Error deleting node:', error);
      toast.error('Failed to delete node');
      fetchNodes();
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading registry...</div>;
  }

  return (
    <div className="space-y-6 min-h-[160px]" style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center">
            <SafeIcon icon={FiShield} className="mr-2 text-onyx-accent" />
            Ecosystem Registry
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage circuit breakers and quarantine state for Swarm micro-apps.
          </p>
        </div>
        <button
           onClick={() => setShowAddForm(!showAddForm)}
           className="bg-onyx-accent hover:bg-onyx-accent/80 text-white px-4 py-2 rounded flex items-center text-sm"
        >
          <SafeIcon icon={FiPlus} className="mr-2" /> Add Node
        </button>
      </div>

      {showAddForm && (
         <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg p-4 mb-6">
            <form onSubmit={handleAddNode} className="flex gap-4 items-end">
               <div className="flex-1">
                 <label className="block text-xs text-slate-400 mb-1">App Name</label>
                 <input type="text" required value={newNode.app_name} onChange={e => setNewNode({...newNode, app_name: e.target.value})} className="w-full bg-onyx-950 border border-onyx-accent/30 rounded px-3 py-2 text-white text-sm" />
               </div>
               <div className="flex-1">
                 <label className="block text-xs text-slate-400 mb-1">Health Endpoint URL</label>
                 <input type="url" required value={newNode.health_endpoint_url} onChange={e => setNewNode({...newNode, health_endpoint_url: e.target.value})} className="w-full bg-onyx-950 border border-onyx-accent/30 rounded px-3 py-2 text-white text-sm" />
               </div>
               <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm">Save</button>
            </form>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nodes.length === 0 ? (
          <div className="col-span-full text-center text-slate-400 text-sm">
            No nodes found in the registry.
          </div>
        ) : (
          nodes.map((node) => (
            <div key={node.id} className="rounded-lg p-5 border border-onyx-accent/20 transition-all shadow-lg" style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-white truncate pr-4">{node.app_name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleStatus(node.id, node.status)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      node.status === 'operational' ? 'bg-onyx-accent' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        node.status === 'operational' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => handleDeleteNode(node.id)}
                    className="text-red-500 hover:text-red-400 focus:outline-none transition-colors"
                  >
                    <SafeIcon icon={FiTrash2} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-slate-400 truncate mb-1" title={node.health_endpoint_url}>
                  {node.health_endpoint_url}
                </p>
                <div className="flex items-center gap-2 mt-2">
                   {(node.computedStatus || node.status) === 'operational' ? (
                      <span className="inline-flex items-center text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full text-xs font-medium">
                        <SafeIcon icon={FiCheckCircle} className="mr-1 h-3 w-3" />
                        Operational
                      </span>
                    ) : (node.computedStatus || node.status) === 'degraded' ? (
                      <span className="inline-flex items-center text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full text-xs font-medium">
                        <SafeIcon icon={FiAlertTriangle} className="mr-1 h-3 w-3" />
                        Degraded
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-400 bg-red-400/10 px-2 py-1 rounded-full text-xs font-medium">
                        <SafeIcon icon={FiAlertTriangle} className="mr-1 h-3 w-3" />
                        Offline
                      </span>
                    )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-onyx-accent/10 flex justify-between items-center text-xs">
                 <span className="text-slate-500 font-mono">
                    {node.last_ping ? `Last seen: ${new Date(node.last_ping).toLocaleTimeString()}` : 'Never seen'}
                 </span>
                 <span className="text-slate-400 font-mono flex items-center">
                    Latency: <span className="ml-1 text-white">{node.ping_ms || 0}ms</span>
                 </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EcosystemRegistry;
