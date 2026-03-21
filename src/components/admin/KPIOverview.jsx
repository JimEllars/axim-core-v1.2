import React, { useEffect, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { FiTrendingUp, FiUsers, FiDollarSign, FiActivity, FiUserPlus, FiTarget, FiPieChart, FiBarChart2 } from 'react-icons/fi';

const KPICard = ({ title, value, change, icon: Icon, color, info }) => (
  <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20 flex flex-col justify-between h-36 hover:border-onyx-accent/50 transition-colors">
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="text-white text-lg" />
      </div>
    </div>
    <div className="flex flex-col">
      <div className="flex items-center text-xs mt-2">
        <span className={change >= 0 ? 'text-green-400' : 'text-red-400'}>
          {change >= 0 ? '+' : ''}{change}%
        </span>
        <span className="text-slate-500 ml-2">vs last month</span>
      </div>
      {info && <span className="text-xs text-slate-500 mt-1">{info}</span>}
    </div>
  </div>
);

const KPIOverview = () => {
  const { supabase } = useSupabase();
  const [metrics, setMetrics] = useState({
    mrr: 0,
    activeSubscribers: 0,
    churnRate: 0,
    rpc: 0,
    cac: 0,
    ltv: 0,
    grossMargin: 0,
    dailyActiveUsers: 0
  });

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
        // 1. Active Subscribers
        let subscriberCount = 0;
        try {
            const { count, error } = await supabase
                .from('subscriptions_ax2024')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            if (!error) {
                subscriberCount = count || 0;
            }
        } catch (innerError) {
            console.warn("Could not fetch subscriptions for KPIs, using 0:", innerError);
        }

        // 2. Daily Active Users (Events in last 24h)
        let dau = 0;
        try {
           const { count, error } = await supabase
             .from('events_ax2024')
             .select('*', { count: 'exact', head: true })
             .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
           if (!error) dau = count || 0;
        } catch (e) {
           console.warn("Could not fetch DAU, using 0:", e);
        }

        // 3. Calculate MRR (Estimated based on standard plan price of $29)
        // In a real scenario, we would sum the actual plan amounts from the subscription table.
        const estimatedMRR = subscriberCount * 29;

        // 4. Set Metrics (Mixing real data with placeholders/mocks for MVP)
        setMetrics(prev => ({
            ...prev,
            mrr: estimatedMRR,
            activeSubscribers: subscriberCount,
            churnRate: 2.4, // Placeholder: Requires historical subscription analysis
            rpc: 12.50, // Placeholder: Revenue Per Click (Requires ad network integration)
            cac: 45.00, // Placeholder: Customer Acquisition Cost (Requires marketing spend data)
            ltv: 850.00, // Placeholder: Lifetime Value (Requires long-term cohort analysis)
            grossMargin: 78, // Placeholder: Gross Margin % (Requires cost accounting data)
            dailyActiveUsers: dau
        }));

    } catch (e) {
        console.error("Failed to fetch KPI metrics:", e);
        // Fallback to zeros is handled by initial state
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Core Financials */}
        <KPICard
            title="Monthly Recurring Revenue"
            value={`$${metrics.mrr.toLocaleString()}`}
            change={12} // Placeholder change %
            icon={FiDollarSign}
            color="bg-green-500/20"
        />
        <KPICard
            title="Active Subscribers"
            value={metrics.activeSubscribers}
            change={5} // Placeholder change %
            icon={FiUsers}
            color="bg-blue-500/20"
        />
        <KPICard
            title="Churn Rate"
            value={`${metrics.churnRate}%`}
            change={-0.5} // Placeholder change %
            icon={FiActivity}
            color="bg-red-500/20"
            info="Target: < 2%"
        />
         <KPICard
            title="Revenue Per Click (RPC)"
            value={`$${metrics.rpc.toFixed(2)}`}
            change={8} // Placeholder change %
            icon={FiTrendingUp}
            color="bg-purple-500/20"
        />

        {/* Growth & Efficiency */}
        <KPICard
            title="Customer Acquisition Cost"
            value={`$${metrics.cac.toFixed(2)}`}
            change={-2.1} // Placeholder change %
            icon={FiUserPlus}
            color="bg-orange-500/20"
        />
        <KPICard
            title="Lifetime Value (LTV)"
            value={`$${metrics.ltv.toFixed(2)}`}
            change={4.5} // Placeholder change %
            icon={FiTarget}
            color="bg-teal-500/20"
        />
        <KPICard
            title="Gross Margin"
            value={`${metrics.grossMargin}%`}
            change={1.2} // Placeholder change %
            icon={FiPieChart}
            color="bg-indigo-500/20"
        />
        <KPICard
            title="Daily Active Users"
            value={metrics.dailyActiveUsers}
            change={15} // Placeholder change %
            icon={FiBarChart2}
            color="bg-cyan-500/20"
        />
      </div>

      {/* Placeholder for future charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20 h-80 flex flex-col items-center justify-center text-center">
            <FiBarChart2 className="text-slate-600 text-4xl mb-4" />
            <h3 className="text-lg font-medium text-slate-300">Revenue vs Costs Trend</h3>
            <p className="text-slate-500 text-sm mt-2">Historical financial data visualization coming soon.</p>
        </div>
        <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20 h-80 flex flex-col items-center justify-center text-center">
            <FiUsers className="text-slate-600 text-4xl mb-4" />
             <h3 className="text-lg font-medium text-slate-300">User Growth & Churn Analysis</h3>
            <p className="text-slate-500 text-sm mt-2">Cohort retention analysis visualization coming soon.</p>
        </div>
      </div>
    </div>
  );
};

export default KPIOverview;
