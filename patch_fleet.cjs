const fs = require('fs');
const file = 'src/components/dashboard/FleetStatusMap.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "        const { data: devices, error: deviceError } = await supabase\n          .from('devices')\n          .select('*')\n          .order('device_name');\n\n        if (deviceError) throw deviceError;",
  "        const { data: devices, error: deviceError } = await supabase\n          .from('ecosystem_nodes')\n          .select('*')\n          .order('app_name');\n\n        if (deviceError) throw deviceError;"
);

content = content.replace(
  "        const mappedStatus = (devices || []).map(device => {\n            let statusColor = 'bg-green-500/20 border-green-500 text-green-400';\n            if (device.status === 'busy') statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';\n            if (device.status === 'offline') statusColor = 'bg-red-500/20 border-red-500 text-red-400';\n\n            return {\n                id: device.id,\n                revenue: revenueByApp[device.device_name] || 0,\n                name: device.device_name,\n                status: device.status,\n                statusColor,\n                telemetry: [\n                   ...mockTelemetry.map(t => ({...t, id: Math.random()}))\n                ]\n            };\n        });",
  "        const mappedStatus = (devices || []).map(device => {\n            let statusColor = 'bg-green-500/20 border-green-500 text-green-400';\n            let isPulsing = true;\n            if (device.status === 'offline') {\n                statusColor = 'bg-red-500/20 border-red-500 text-red-400';\n                isPulsing = false;\n            }\n            if (device.status === 'degraded') {\n                statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';\n            }\n\n            return {\n                id: device.id,\n                revenue: revenueByApp[device.app_name] || 0,\n                name: device.app_name,\n                status: device.status,\n                statusColor,\n                isPulsing,\n                telemetry: [\n                   ...mockTelemetry.map(t => ({...t, id: Math.random()}))\n                ]\n            };\n        });"
);

content = content.replace(
  "    <div className=\"glass-effect rounded-xl p-6 mb-8\">",
  `    <div className="glass-effect rounded-xl p-6 mb-8">
      {fleetStatus.some(d => d.status === 'offline') && (
        <div className="bg-red-900/30 border border-red-500 text-red-400 px-4 py-3 rounded relative mb-4 flex items-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
          <SafeIcon icon={FiAlertTriangle} className="mr-3 text-2xl" />
          <div>
            <strong className="font-bold block text-red-300 text-lg">⚠️ Outage Detected.</strong>
            <span className="block sm:inline">Onyx Sentinel dispatched for diagnostics. </span>
            <a href="/admin?tab=workflows" className="underline font-bold text-red-200 hover:text-white transition-colors">Go to Approval Queue</a>
          </div>
        </div>
      )}`
);

content = content.replace(
  "                      <span className=\"text-xs font-semibold truncate w-full text-center\">{device.name}</span>",
  `                      <div className="flex items-center space-x-2 w-full justify-center">
                          <div className={\`w-2 h-2 rounded-full \${device.status === 'online' ? 'bg-green-500 animate-pulse' : device.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}\`}></div>
                          <span className="text-xs font-semibold truncate text-center">{device.name}</span>
                      </div>`
);

fs.writeFileSync(file, content);
