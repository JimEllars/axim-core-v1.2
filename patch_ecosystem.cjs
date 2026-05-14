const fs = require('fs');
const file = 'src/components/admin/EcosystemRegistry.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `  const fetchApps = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAllEcosystemApps();
      const error = null;

      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching ecosystem apps:', error);
      toast.error('Failed to load ecosystem apps');
    } finally {
      setIsLoading(false);
    }
  };`,
  `  const fetchApps = async () => {
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
  };`
);

content = content.replace(
  `  const handleToggleStatus = async (appId, currentStatus) => {
    try {
      const newStatus = !currentStatus;

      // Optimistic update
      setApps(apps.map(app =>
        app.app_id === appId ? { ...app, is_active: newStatus } : app
      ));

      await api.updateEcosystemAppStatus(appId, newStatus);
      const error = null;

      if (error) throw error;

      toast.success(\`\${appId} is now \${newStatus ? 'Active' : 'Quarantined'}\`);
    } catch (error) {
      console.error('Error toggling app status:', error);
      toast.error('Failed to update app status');
      // Revert on error
      fetchApps();
    }
  };`,
  `  const [newAppName, setNewAppName] = useState('');
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
  };`
);

content = content.replace(
  `      </div>

      <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg overflow-hidden">`,
  `      </div>

      <div className="flex space-x-4 mb-6">
         <input type="text" placeholder="App Name" className="bg-onyx-950 border border-onyx-accent/30 rounded p-2 text-white" value={newAppName} onChange={e => setNewAppName(e.target.value)} />
         <input type="text" placeholder="Health URL" className="bg-onyx-950 border border-onyx-accent/30 rounded p-2 text-white flex-1" value={newAppUrl} onChange={e => setNewAppUrl(e.target.value)} />
         <button onClick={handleAddApp} className="bg-onyx-accent text-onyx-950 px-4 py-2 rounded font-bold">Add App</button>
      </div>

      <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg overflow-hidden">`
);

content = content.replace(
  `              apps.map((app) => (
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
                      className={\`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none \${
                        app.is_active ? 'bg-onyx-accent' : 'bg-slate-600'
                      }\`}
                    >
                      <span
                        className={\`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out \${
                          app.is_active ? 'translate-x-5' : 'translate-x-0'
                        }\`}
                      />
                    </button>
                  </td>
                </tr>
              ))`,
  `              apps.map((app) => (
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
              ))`
);

fs.writeFileSync(file, content);
