const fs = require('fs');

let code = fs.readFileSync('src/components/admin/SecurityAudit.jsx', 'utf8');

const targetImports = `import { FiShield, FiAlertTriangle } from 'react-icons/fi';`;
const replacementImports = `import { FiShield, FiAlertTriangle, FiActivity, FiServer } from 'react-icons/fi';`;

const targetState = `  const [error, setError] = useState(null);`;
const replacementState = `  const [error, setError] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState(null);`;

const targetFetch = `    fetchLogs();
  }, [supabase]);`;
const replacementFetch = `    fetchLogs();

    const fetchTelemetry = async () => {
      setLoadingTelemetry(true);
      try {
        const { data, error } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('error_code', 429)
          .order('timestamp', { ascending: false })
          .limit(50);

        if (error) throw error;
        setTelemetryLogs(data || []);
      } catch (err) {
        logger.error("Failed to fetch telemetry logs:", err);
      } finally {
        setLoadingTelemetry(false);
      }
    };
    fetchTelemetry();
  }, [supabase]);`;

const targetRender = `    </div>
  );
};

export default SecurityAudit;`;
const replacementRender = `    </div>

      <div className="glass-effect rounded-xl p-6 mt-8">
        <div className="flex items-center mb-6">
          <SafeIcon icon={FiActivity} className="mr-3 text-2xl text-yellow-400" />
          <div>
            <h2 className="text-xl font-bold text-white">API Gateway Rate Limits</h2>
            <p className="text-sm text-slate-400">Recent 429 Too Many Requests events</p>
          </div>
        </div>

        {loadingTelemetry ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-onyx-950/50 h-16 rounded-lg w-full"></div>
            ))}
          </div>
        ) : telemetryLogs.length === 0 ? (
          <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
            No rate limit events recorded recently.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-onyx-accent/20 text-xs uppercase tracking-wider text-slate-400">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Partner ID</th>
                  <th className="p-3">Endpoint</th>
                  <th className="p-3">Correlation ID</th>
                </tr>
              </thead>
              <tbody>
                {telemetryLogs.map((log) => (
                  <tr key={log.id} className="border-b border-onyx-accent/10 hover:bg-onyx-950/50 transition-colors text-sm">
                    <td className="p-3 text-slate-300">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 text-slate-300 font-mono text-xs">
                      {log.details?.partnerId || 'Unknown'}
                    </td>
                    <td className="p-3 text-slate-300">
                      {log.endpoint}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedTraceId(selectedTraceId === log.correlation_id ? null : log.correlation_id)}
                        className="text-indigo-400 hover:text-indigo-300 font-mono text-xs transition-colors"
                      >
                        {log.correlation_id || 'N/A'}
                      </button>
                      {selectedTraceId === log.correlation_id && (
                        <div className="mt-2 p-3 bg-onyx-950 rounded border border-onyx-accent/20 text-xs text-slate-400">
                          <p><strong>Trace Details:</strong></p>
                          <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                      )}
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

export default SecurityAudit;`;

if (code.includes(targetImports)) { code = code.replace(targetImports, replacementImports); }
if (code.includes(targetState)) { code = code.replace(targetState, replacementState); }
if (code.includes(targetFetch)) { code = code.replace(targetFetch, replacementFetch); }
if (code.includes(targetRender)) { code = code.replace(targetRender, replacementRender); }

fs.writeFileSync('src/components/admin/SecurityAudit.jsx', code);
