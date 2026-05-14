import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import toast from 'react-hot-toast';

const { FiCheckCircle, FiXCircle, FiShield, FiAlertTriangle } = FiIcons;

const EcosystemRegistry = () => {
  const [apps, setApps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('ecosystem_nodes').select('*').order('created_at', { ascending: false });

      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching ecosystem apps:', error);
      toast.error('Failed to load ecosystem apps');
    } finally {
      setIsLoading(false);
    }
  };

  const [newAppName, setNewAppName] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');

  const handleAddApp = async () => {
    if (!newAppName || !newAppUrl) return toast.error('Name and URL required');
    try {
      const { error } = await supabase.from('ecosystem_nodes').insert([
        { app_name: newAppName, health_endpoint_url: newAppUrl, status: 'online' }
      ]);

      if (error) throw error;

      toast.success('App added successfully');
      setNewAppName('');
      setNewAppUrl('');
      fetchApps();
    } catch (error) {
      console.error('Error adding app:', error);
      toast.error('Failed to add app');
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
      </div>

      <div className="flex space-x-4 mb-6">
         <input type="text" placeholder="App Name" className="bg-onyx-950 border border-onyx-accent/30 rounded p-2 text-white" value={newAppName} onChange={e => setNewAppName(e.target.value)} />
         <input type="text" placeholder="Health URL" className="bg-onyx-950 border border-onyx-accent/30 rounded p-2 text-white flex-1" value={newAppUrl} onChange={e => setNewAppUrl(e.target.value)} />
         <button onClick={handleAddApp} className="bg-onyx-accent text-onyx-950 px-4 py-2 rounded font-bold">Add App</button>
      </div>

      <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-onyx-accent/20">
          <thead className="bg-onyx-950">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                App ID
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
            {apps.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-6 py-4 text-center text-slate-400 text-sm">
                  No apps found in the registry.
                </td>
              </tr>
            ) : (
              apps.map((app) => (
                <tr key={app.id} className={app.status !== 'online' ? 'bg-red-900/10' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    {app.app_name} <br/><span className="text-xs text-slate-400">{app.health_endpoint_url}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {app.status === 'online' ? (
                      <span className="inline-flex items-center text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiCheckCircle} className="mr-1 h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-400 bg-red-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiAlertTriangle} className="mr-1 h-3 w-3" />
                        {app.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {app.last_ping && <span className="text-xs text-slate-400">Last ping: {new Date(app.last_ping).toLocaleString()}</span>}
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
