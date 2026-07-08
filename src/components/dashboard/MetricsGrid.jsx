import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useMetrics } from '../../hooks/useMetrics';
import { useSupabase } from '../../contexts/SupabaseContext';

const { FiCpu, FiShield, FiLink, FiBox, FiDollarSign, FiAlertTriangle } = FiIcons;

const MetricsGrid = () => {
  const { metrics: initialMetrics, loading, error, refetch } = useMetrics();
  const { supabase } = useSupabase();
  const [metrics, setMetrics] = React.useState(null);

  React.useEffect(() => {
    if (initialMetrics) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetrics(initialMetrics);
    }
  }, [initialMetrics]);

  React.useEffect(() => {
    if (!supabase) return;

    const channels = [
      supabase.channel('api_usage_logs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'api_usage_logs' }, refetch).subscribe(),
      supabase.channel('micro_app_transactions_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'micro_app_transactions' }, refetch).subscribe(),
      supabase.channel('contacts_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, refetch).subscribe(),
      supabase.channel('support_tickets_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, refetch).subscribe(),
      supabase.channel('hardware_link_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refetch).subscribe()
    ];

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [supabase, refetch]);

  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="col-span-full glass-effect rounded-xl p-6 flex items-center justify-center text-red-400">
          <SafeIcon icon={FiAlertTriangle} className="mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="glass-effect rounded-xl p-6">
            <div data-testid="loading-skeleton" className="animate-pulse flex flex-col">
              <div className="h-12 w-12 glass-effect rounded-lg mb-4"></div>
              <div className="h-4 glass-effect rounded w-3/4 mb-2"></div>
              <div className="h-8 glass-effect rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const metricCards = [
    {
      title: 'Onyx AI',
      value: metrics.aiInteractions?.toLocaleString() || '0',
      icon: FiCpu,
      color: 'from-blue-500 to-indigo-600',
      change: 'Active',
      changeColor: 'text-blue-400',
      tooltip: 'Onyx Mk3 System Intelligence Operations'
    },
    {
      title: 'Support SOC',
      value: metrics.activeEvents?.toLocaleString() || '0',
      icon: FiShield,
      color: 'from-emerald-500 to-teal-600',
      change: 'Monitoring',
      changeColor: 'text-emerald-400',
      tooltip: 'Support Security Operations Center'
    },
    {
      title: 'Hardware Link',
      value: metrics.activeUsers?.toLocaleString() || '0',
      icon: FiLink,
      color: 'from-orange-500 to-amber-600',
      change: 'Connected',
      changeColor: 'text-orange-400',
      tooltip: 'Active Hardware Node Connections'
    },
    {
      title: 'Micro Apps',
      value: metrics.totalGenerations?.toLocaleString() || '0',
      icon: FiBox,
      color: 'from-purple-500 to-fuchsia-600',
      change: 'Deployed',
      changeColor: 'text-purple-400',
      tooltip: 'Decentralized Micro Application Fleet'
    },
    {
      title: 'Finance Ledgers',
      value: '$' + (metrics.totalGenerations ? (metrics.totalGenerations * 1.5).toLocaleString() : '0'),
      icon: FiDollarSign,
      color: 'from-green-500 to-emerald-600',
      change: 'Synced',
      changeColor: 'text-green-400',
      tooltip: 'Consolidated Transaction Ledgers'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
      {metricCards.map((metric, index) => (
        <motion.div
          key={metric.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="glass-effect rounded-xl p-6 hover:bg-white/10 transition-all duration-300 relative group"
        >
          {/* Tooltip */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-2 hidden group-hover:block z-10 w-48 p-2 glass-effect border border-onyx-accent/20 text-slate-300 text-xs rounded shadow-xl text-center">
            {metric.tooltip}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-2 h-2 glass-effect border-r border-b border-onyx-accent/20 transform rotate-45"></div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className={`w-12 h-12 bg-gradient-to-r ${metric.color} rounded-lg flex items-center justify-center shadow-lg`}>
              <SafeIcon icon={metric.icon} className="text-white text-xl" />
            </div>
            <span className={`text-xs ${metric.changeColor} font-medium glass-effect/50 px-2 py-1 rounded-full flex items-center gap-1`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
              {metric.change}
            </span>
          </div>
          
          <div>
            <h3 className="text-slate-400 text-sm font-medium mb-1">
              {metric.title}
            </h3>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? (
                <div data-testid="loading-skeleton" className="animate-pulse glass-effect h-8 w-16 rounded"></div>
              ) : (
                metric.value
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default MetricsGrid;
