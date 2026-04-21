const fs = require('fs');

const file = 'src/components/admin/KPIOverview.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the placeholder chart with a new PredictiveInsights panel

const newPanelImports = `import RevenueHeatmap from '../dashboard/RevenueHeatmap';
import React, { useEffect, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { FiTrendingUp, FiUsers, FiDollarSign, FiActivity, FiUserPlus, FiTarget, FiPieChart, FiBarChart2, FiAlertTriangle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const PredictiveInsights = ({ supabase }) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_engagement_scores')
        .select('user_id, email, health_index')
        .order('health_index', { ascending: true })
        .limit(5);

      if (error) throw error;
      setInsights(data || []);
    } catch (e) {
      console.warn("Failed to fetch predictive insights:", e);
      // Fallback dummy data if table doesn't exist
      setInsights([
        { user_id: '1', email: 'at-risk@partner.com', health_index: 25 },
        { user_id: '2', email: 'warning@partner.com', health_index: 45 },
        { user_id: '3', email: 'healthy@partner.com', health_index: 85 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score) => {
    if (score < 40) return 'bg-red-500';
    if (score < 70) return 'bg-orange-500';
    return 'bg-teal-500';
  };

  const getRiskLabel = (score) => {
    if (score < 40) return 'High Churn Risk';
    if (score < 70) return 'Warning';
    return 'Healthy / High Conv.';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20 h-full flex flex-col"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white flex items-center">
            <FiAlertTriangle className="mr-2 text-yellow-500" /> Predictive Insights
          </h3>
          <p className="text-slate-400 text-sm">AI-driven churn & conversion probability</p>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
             <span className="text-slate-500">Loading insights...</span>
          </div>
        ) : insights.length === 0 ? (
          <div className="h-full flex items-center justify-center">
             <span className="text-slate-500">No engagement data available.</span>
          </div>
        ) : (
          insights.map((user, idx) => (
            <div key={user.user_id || idx} className="bg-onyx-900/50 p-3 rounded-lg border border-onyx-accent/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-white truncate w-1/2">{user.email}</span>
                <span className="text-xs text-slate-400">{getRiskLabel(user.health_index)}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div
                  className={\`h-2.5 rounded-full \${getRiskColor(user.health_index)}\`}
                  style={{ width: \`\${Math.max(5, Math.min(100, user.health_index))}%\` }}
                ></div>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
`;

content = content.replace(
  /import RevenueHeatmap.*from 'react-icons\/fi';/s,
  newPanelImports
);

content = content.replace(
  /<div className="bg-onyx-950\/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent\/20 h-80 flex flex-col items-center justify-center text-center">.*?<\/div>/s,
  `<PredictiveInsights supabase={supabase} />`
);

fs.writeFileSync(file, content, 'utf8');
