import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
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
      const { data, error } = await supabase
        .from('ecosystem_apps')
        .select('*')
        .order('app_id', { ascending: true });

      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching ecosystem apps:', error);
      toast.error('Failed to load ecosystem apps');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (appId, currentStatus) => {
    try {
      const newStatus = !currentStatus;

      // Optimistic update
      setApps(apps.map(app =>
        app.app_id === appId ? { ...app, is_active: newStatus } : app
      ));

      const { error } = await supabase
        .from('ecosystem_apps')
        .update({ is_active: newStatus })
        .eq('app_id', appId);

      if (error) throw error;

      toast.success(`${appId} is now ${newStatus ? 'Active' : 'Quarantined'}`);
    } catch (error) {
      console.error('Error toggling app status:', error);
      toast.error('Failed to update app status');
      // Revert on error
      fetchApps();
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
                <tr key={app.app_id} className={!app.is_active ? 'bg-red-900/10' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    {app.app_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {app.is_active ? (
                      <span className="inline-flex items-center text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiCheckCircle} className="mr-1 h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-400 bg-red-400/10 px-2 py-1 rounded-full">
                        <SafeIcon icon={FiAlertTriangle} className="mr-1 h-3 w-3" />
                        Quarantined
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleToggleStatus(app.app_id, app.is_active)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        app.is_active ? 'bg-onyx-accent' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          app.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
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
