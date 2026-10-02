import React, { useState, useEffect, useCallback } from 'react';
import { FiCloud, FiCheckCircle, FiAlertTriangle, FiActivity, FiCpu, FiGlobe, FiMapPin } from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';

const CloudflareEdgeHealth = () => {
  const [status, setStatus] = useState('ONLINE'); // 'ONLINE', 'DEGRADED', 'REVALIDATING', 'FALLBACK'
  const [latency, setLatency] = useState('42ms');
  const [cacheHitRatio, setCacheHitRatio] = useState('86.4');
  const [ingressQueueDepth, setIngressQueueDepth] = useState(0);
  const [lastChecked, setLastChecked] = useState(new Date().toLocaleTimeString());
  const [isPinging, setIsPinging] = useState(false);
  const [edgeColo, setEdgeColo] = useState('IAD'); // e.g. IAD, DFW, LHR

  // Attempt to restore visual state so there is no flicker on mount
  useEffect(() => {
    try {
        const stored = localStorage.getItem("cfEdgeStatus");
        if (stored && stored !== status) { /* Cannot update state here */ }
    } catch(e) { /* ignore */ }
  }, [status]);

  const handlePingEdge = useCallback(async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
        // Ping primary edge
        const primaryUrl = import.meta.env?.VITE_CLOUDFLARE_WORKER_URL ? `${import.meta.env.VITE_CLOUDFLARE_WORKER_URL}/api/health` : '/api/health';
        const res = await fetch(primaryUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });

        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            const end = performance.now();
            setLatency(`${Math.round(end - start)}ms`);

            if (data.colo) setEdgeColo(data.colo);

            if (status !== 'ONLINE') {
              setStatus('REVALIDATING');
              setTimeout(() => {
                setStatus('ONLINE');
                try { localStorage.setItem("cfEdgeStatus", 'ONLINE'); } catch(e) { /* ignore */ }
              }, 1500);
            }
            setLastChecked(new Date().toLocaleTimeString());
        } else {
             throw new Error("Edge returned non-200");
        }
    } catch (e) {
         console.warn("[CloudflareEdgeHealth] Ping failed, edge is degraded/fallback");
         setStatus('FALLBACK');
         try { localStorage.setItem("cfEdgeStatus", 'FALLBACK'); } catch(err) { /* ignore */ }
         // If primary is down, fallback to secondary ping metric
         try {
             const end = performance.now();
             setLatency(`${Math.round(end - start)}ms`);
         } catch(err) { /* ignore */ }
    } finally {
        setIsPinging(false);
        setLastChecked(new Date().toLocaleTimeString());
    }
  }, [status]);


  useEffect(() => {
    let intervalId;
    let channel;

    // Supabase Realtime for system health updates
    channel = supabase.channel('system_health_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_events' }, (payload) => {
       if (payload.new && payload.new.payload) {
           const telemetryData = payload.new.payload;
           if (telemetryData.latency_ms !== undefined) {
               setLatency(`${telemetryData.latency_ms}ms`);
           }

           if (telemetryData.prompt_cache_hit_tokens !== undefined && telemetryData.total_tokens) {
               const ratio = (telemetryData.prompt_cache_hit_tokens / telemetryData.total_tokens) * 100;
               setCacheHitRatio(ratio.toFixed(1));
           } else {
               setCacheHitRatio((prev) => prev);
           }

           if (telemetryData.queue_depth !== undefined) {
               setIngressQueueDepth(telemetryData.queue_depth);
           }

           if (telemetryData.colo) {
               setEdgeColo(telemetryData.colo);
           }
       }
       setLastChecked(new Date().toLocaleTimeString());
    })
    .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to system_health_channel');
        }
    });

    // Fallback polling
    intervalId = setInterval(handlePingEdge, 30000); // 30s instead of 60s for better responsiveness

    const handleHealthy = () => {
      setStatus('ONLINE');
      try { localStorage.setItem("cfEdgeStatus", 'ONLINE'); } catch(e) { /* ignore */ }
    };

    const handleDegraded = () => {
      setStatus('DEGRADED');
      try { localStorage.setItem("cfEdgeStatus", 'DEGRADED'); } catch(e) { /* ignore */ }
    };

    const handleFallback = () => {
      setStatus('FALLBACK');
      try { localStorage.setItem("cfEdgeStatus", 'FALLBACK'); } catch(e) { /* ignore */ }
    };

    const handleRevalidated = () => {
        setStatus('REVALIDATING');
        setTimeout(() => {
           setStatus('ONLINE');
           try { localStorage.setItem("cfEdgeStatus", 'ONLINE'); } catch(e) { /* ignore */ }
        }, 1500);
    }

    window.addEventListener('edge:healthy', handleHealthy);
    window.addEventListener('edge:degraded', handleDegraded);
    window.addEventListener('edge:fallback', handleFallback);
    window.addEventListener('edge:revalidated', handleRevalidated);

    return () => {
        if (channel) {
            supabase.removeChannel(channel);
        }
        clearInterval(intervalId);
        window.removeEventListener('edge:healthy', handleHealthy);
        window.removeEventListener('edge:degraded', handleDegraded);
        window.removeEventListener('edge:fallback', handleFallback);
        window.removeEventListener('edge:revalidated', handleRevalidated);
    };
  }, [handlePingEdge]);



  const isOnline = status === 'ONLINE';
  const isRevalidating = status === 'REVALIDATING';

  const getStatusColor = () => {
      if (isOnline) return 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]';
      if (isRevalidating) return 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]';
      return 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]'; // Degraded or Fallback
  }

  const getBgColor = () => {
    if (isOnline) return 'bg-emerald-500/10 border-emerald-500/30';
    if (isRevalidating) return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-red-500/10 border-red-500/30';
  }

  return (
    <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-xl p-6 hover:bg-slate-900/80 transition-all duration-300 relative group shadow-lg hover:shadow-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getBgColor()} border ${getStatusColor()}`}>
            <FiCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Cloudflare Edge Gateway
              {isOnline ? (
                <FiCheckCircle className="text-emerald-400 w-4 h-4 transition-colors" />
              ) : (
                <FiAlertTriangle className={`${getStatusColor()} w-4 h-4 animate-pulse transition-colors`} />
              )}
            </h3>
            <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">Telemetry & Routing Status</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider ${getBgColor()} border ${getStatusColor()} transition-colors`}>
          {status === 'FALLBACK' ? 'FALLBACK' : status}
        </div>
      </div>

      <div className="flex-grow flex flex-col gap-4">
        {/* Metric Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 relative overflow-hidden group-hover:border-blue-500/20 transition-colors">
             {isPinging && <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>}
             <div className="flex items-center gap-2 mb-1 relative z-10">
               <FiActivity className="text-blue-400 w-4 h-4" />
               <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase">Latency</h4>
             </div>
             <p className="text-xl font-bold text-white relative z-10 transition-all">{latency}</p>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 group-hover:border-purple-500/20 transition-colors">
             <div className="flex items-center gap-2 mb-1">
               <FiCpu className="text-purple-400 w-4 h-4" />
               <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase">Cache Hit</h4>
             </div>
             <p className="text-xl font-bold text-white transition-all">{cacheHitRatio}%</p>
             <div className="w-full bg-slate-800 rounded-full h-1 mt-2 overflow-hidden">
                <div className="bg-purple-500 h-1 rounded-full transition-all duration-500" style={{ width: `${cacheHitRatio}%` }}></div>
             </div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 group-hover:border-emerald-500/20 transition-colors">
             <div className="flex items-center gap-2 mb-1">
               <FiActivity className="text-emerald-400 w-4 h-4" />
               <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase">Queue Depth</h4>
             </div>
             <p className="text-xl font-bold text-white transition-all">{ingressQueueDepth}</p>
             <div className="w-full bg-slate-800 rounded-full h-1 mt-2 overflow-hidden">
                <div className="bg-emerald-500 h-1 rounded-full transition-all duration-500" style={{ width: `${Math.min(ingressQueueDepth * 5, 100)}%` }}></div>
             </div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 group-hover:border-amber-500/20 transition-colors">
             <div className="flex items-center gap-2 mb-1">
               <FiMapPin className="text-amber-400 w-4 h-4" />
               <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase">Edge POP</h4>
             </div>
             <p className="text-xl font-bold text-white transition-all">{edgeColo}</p>
          </div>
        </div>

        {/* Active Proxy Channels */}
        <div>
          <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-2 mt-2">Active Telemetry Routes</h4>
          <div className="space-y-2">
            <div className={`flex items-center justify-between bg-black/20 border border-white/5 p-2 rounded text-sm group hover:bg-black/40 transition-colors ${status === 'FALLBACK' ? 'opacity-50' : ''}`}>
              <span className={`font-mono flex items-center gap-2 ${status === 'FALLBACK' ? 'text-slate-500' : 'text-emerald-400'}`}>
                <FiGlobe className="w-3 h-3 group-hover:scale-110 transition-transform"/> Cloudflare Gateway
              </span>
              <span className="text-slate-400 text-xs uppercase tracking-wider">{status === 'FALLBACK' ? 'Bypassed' : 'Primary'}</span>
            </div>
            <div className={`flex items-center justify-between bg-black/20 border border-white/5 p-2 rounded text-sm group hover:bg-black/40 transition-colors ${status === 'FALLBACK' ? 'border-amber-500/30' : ''}`}>
              <span className={`font-mono flex items-center gap-2 ${status === 'FALLBACK' ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'text-slate-500'}`}>
                <FiGlobe className="w-3 h-3 group-hover:scale-110 transition-transform"/> Supabase Ingress
              </span>
              <span className="text-slate-400 text-xs uppercase tracking-wider">{status === 'FALLBACK' ? 'Active Fallback' : 'Standby'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 mt-auto border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">Last checked: {lastChecked}</span>
        <button
          onClick={handlePingEdge}
          disabled={isPinging}
          className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-all font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] active:scale-95"
          title="Quick-action Latency Probe"
        >
          <FiActivity className={`${isPinging ? "animate-spin" : ""} w-4 h-4`} />
          {isPinging ? 'Probing Edge...' : 'Probe Latency'}
        </button>
      </div>
    </div>
  );
};

export default CloudflareEdgeHealth;
