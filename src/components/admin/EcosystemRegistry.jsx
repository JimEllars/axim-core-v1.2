import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import toast from 'react-hot-toast';

const { FiCheckCircle, FiXCircle, FiShield, FiAlertTriangle, FiPlus, FiTrash2 } = FiIcons;

const EcosystemRegistry = () => {
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNode, setNewNode] = useState({ app_name: '', health_endpoint_url: '' });

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ecosystem_nodes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNodes(data || []);
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
    <div className="space-y-6">
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

      <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-onyx-accent/20">
          <thead className="bg-onyx-950">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                App Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Endpoint URL
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-onyx-accent/20">
            {nodes.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-slate-400 text-sm">
                  No nodes found in the registry.
                </td>
              </tr>
            ) : (
              nodes.map((node) => (
                <tr key={node.id} className={node.status === 'offline' ? 'bg-red-900/10' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    {node.app_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    {node.health_endpoint_url}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {node.status === 'operational' ? (
                      <span className="inline-flex items-center text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiCheckCircle} className="mr-1 h-3 w-3" />
                        Operational
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-400 bg-red-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiAlertTriangle} className="mr-1 h-3 w-3" />
                        Offline
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleToggleStatus(node.id, node.status)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        node.status === 'operational' ? 'bg-onyx-accent' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          node.status === 'operational' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => handleDeleteNode(node.id)}
                      className="ml-4 text-red-500 hover:text-red-700 focus:outline-none"
                    >
                      <SafeIcon icon={FiTrash2} className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EcosystemRegistry;
