import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import api from '../../services/onyxAI/api';
import AIInteractionsChart from './AIInteractionsChart';
import ApiUsageChart from './ApiUsageChart';
import config from '../../config';
import { useDashboard } from '../../contexts/DashboardContext';

const { FiBarChart3, FiPieChart, FiAlertTriangle, FiRefreshCw } = FiIcons;

const VisualizationPanel = () => {
  const { refreshKey } = useDashboard();
  const [sourceData, setSourceData] = useState([]);
  const [eventData, setEventData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVisualizationData = async () => {
    setLoading(true);
    setError(null);

    if (config.isMockLlmEnabled) {
      console.log('Mock mode: providing mock visualization data.');
      const mockSourceData = [
        { name: 'Website', value: 400, color: '#3B82F6' },
        { name: 'Referral', value: 300, color: '#10B981' },
        { name: 'Manual', value: 200, color: '#8B5CF6' },
        { name: 'Campaign', value: 100, color: '#F59E0B' },
      ];
      const mockEventData = [
        { name: 'User Login', value: 50, color: '#F97316' },
        { name: 'Contact Added', value: 25, color: '#A855F7' },
        { name: 'Workflow Run', value: 15, color: '#22C55E' },
        { name: 'AI Query', value: 10, color: '#0EA5E9' },
      ];
      setSourceData(mockSourceData);
      setEventData(mockEventData);
      setLoading(false);
      return;
    }

    try {
      const [sourceRes, eventRes] = await Promise.all([
        api.getContactsBySource(),
        api.getEventsByType()
      ]);

      const sourceColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];
      const sourceChartData = sourceRes.map((item, index) => ({
        name: item.source,
        value: parseInt(item.count),
        color: sourceColors[index % sourceColors.length]
      }));
      setSourceData(sourceChartData);

      const eventColors = ['#F97316', '#A855F7', '#22C55E', '#0EA5E9', '#EC4899'];
      const eventChartData = eventRes.map((item, index) => ({
        name: item.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: parseInt(item.count),
        color: eventColors[index % eventColors.length]
      }));
      setEventData(eventChartData);

    } catch (error) {
      console.error('Error fetching visualization data:', error);
      setError('Failed to load chart data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisualizationData();
  }, [refreshKey]);

  const renderError = (chartName) => (
    <div className="glass-effect rounded-xl p-6 flex items-center justify-center text-red-400 col-span-1">
      <SafeIcon icon={FiAlertTriangle} className="mr-2" />
      Error loading {chartName}.
    </div>
  );

  const ChartSkeleton = () => (
    <div className="h-64 flex flex-col items-center justify-center space-y-4">
       <div className="animate-pulse flex space-x-4 items-end h-full w-full px-8 pb-4">
           <div className="w-1/6 bg-onyx-950 rounded-t h-1/4"></div>
           <div className="w-1/6 bg-onyx-950 rounded-t h-1/2"></div>
           <div className="w-1/6 bg-onyx-950 rounded-t h-3/4"></div>
           <div className="w-1/6 bg-onyx-950 rounded-t h-full"></div>
           <div className="w-1/6 bg-onyx-950 rounded-t h-2/3"></div>
           <div className="w-1/6 bg-onyx-950 rounded-t h-1/3"></div>
       </div>
    </div>
  );

  const PieSkeleton = () => (
    <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse w-48 h-48 bg-onyx-950 rounded-full border-8 border-slate-800"></div>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {error ? renderError('Contacts Chart') : (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-effect rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                  <SafeIcon icon={FiBarChart3} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Contacts by Source</h3>
                  <p className="text-sm text-slate-400">Distribution of contact origins</p>
                </div>
              </div>
              <button onClick={fetchVisualizationData} className="p-2 text-slate-400 hover:text-white hover:bg-onyx-accent/20 rounded-lg transition-colors">
                  <SafeIcon icon={FiRefreshCw} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F9FAFB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
                    cursor={{fill: '#374151', opacity: 0.4}}
                  />
                  <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                      {
                        sourceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))
                      }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        )}

        {error ? renderError('Events Chart') : (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-effect rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow-lg">
                  <SafeIcon icon={FiPieChart} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Event Type Distribution</h3>
                  <p className="text-sm text-slate-400">Breakdown of system events</p>
                </div>
              </div>
              <button onClick={fetchVisualizationData} className="p-2 text-slate-400 hover:text-white hover:bg-onyx-accent/20 rounded-lg transition-colors">
                  <SafeIcon icon={FiRefreshCw} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {loading ? (
              <PieSkeleton />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={eventData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
                      {eventData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F9FAFB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
                      itemStyle={{ color: '#E5E7EB' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {eventData.map((item, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs text-slate-300 truncate" title={item.name}>{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
      <AIInteractionsChart />
      <ApiUsageChart />
    </>
  );
};

export default VisualizationPanel;