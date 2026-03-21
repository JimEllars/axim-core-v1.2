import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import api from '../../services/onyxAI/api';
import config from '../../config';
import { useDashboard } from '../../contexts/DashboardContext';
import logger from '../../services/logging';

const { FiTrendingUp, FiAlertTriangle } = FiIcons;

const ApiUsageChart = () => {
  const { refreshKey } = useDashboard();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApiUsageData = async () => {
    setLoading(true);
    setError(null);

    if (config.isMockLlmEnabled) {
      logger.info('Mock mode: providing mock API usage data.');
      const mockData = [
        { date: '2023-10-01', count: 120 },
        { date: '2023-10-02', count: 150 },
        { date: '2023-10-03', count: 200 },
        { date: '2023-10-04', count: 180 },
        { date: '2023-10-05', count: 250 },
        { date: '2023-10-06', count: 230 },
        { date: '2023-10-07', count: 300 },
      ];
      setData(mockData);
      setLoading(false);
      return;
    }

    try {
      const apiUsageData = await api.getApiUsageOverTime();
      const formattedData = apiUsageData.map(item => ({
        date: new Date(item.date).toLocaleDateString(),
        count: parseInt(item.count)
      }));
      setData(formattedData);
    } catch (error) {
      logger.error('Error fetching API usage data:', error);
      setError('Failed to load API usage data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiUsageData();
  }, [refreshKey]);

  if (error) {
    return (
      <div className="glass-effect rounded-xl p-6 flex items-center justify-center text-red-400">
        <SafeIcon icon={FiAlertTriangle} className="mr-2" />
        {error}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-6 mt-6"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
          <SafeIcon icon={FiTrendingUp} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">API Usage Over Time</h3>
          <p className="text-sm text-slate-400">Daily API call volume</p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F9FAFB' }} />
            <Line type="monotone" dataKey="count" stroke="#2DD4BF" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
};

export default ApiUsageChart;
