import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';

const { FiCpu, FiAlertTriangle } = FiIcons;

const AIInteractionsChart = () => {
  const { data, loading, error } = useSupabaseQuery('get_ai_interactions_over_time');

  const averageInteractions = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const total = data.reduce((acc, item) => acc + item.count, 0);
    return total / data.length;
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass-effect rounded-xl p-6 col-span-1 lg:col-span-2"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
          <SafeIcon icon={FiCpu} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">AI Interactions Over Time</h3>
          <p className="text-sm text-slate-400">Daily command usage</p>
        </div>
      </div>

      {loading && (
        <div className="h-64 flex items-center justify-center">
          <div role="progressbar" className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      )}

      {error && !loading && (
        <div className="h-64 flex flex-col items-center justify-center text-red-400">
          <SafeIcon icon={FiAlertTriangle} className="w-8 h-8 mb-2" />
          <p className="font-semibold">Failed to load chart data.</p>
          <p className="text-sm text-red-300/80">{error.message}</p>
        </div>
      )}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
             <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#fde047" stopOpacity={0.8}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
            />
            <Line type="monotone" dataKey="count" stroke="url(#lineGradient)" strokeWidth={3} dot={false} />
            <ReferenceLine
              y={averageInteractions}
              label={{ value: `Avg: ${averageInteractions.toFixed(1)}`, position: 'insideTopRight', fill: '#6b7280' }}
              stroke="#4b5563"
              strokeDasharray="4 4"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
};

export default AIInteractionsChart;
