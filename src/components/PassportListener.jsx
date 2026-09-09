import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { trackEvent } from '../services/telemetry';
import { cleanseUrlHandoffToken } from '../lib/auth-handoff';
import { useAuth } from '../contexts/AuthContext';

const { FiShield, FiCheckCircle, FiXCircle, FiClock } = FiIcons;

const PassportListener = () => {
  const { isOffline } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Check wildcard session on mount
    const getWildcardCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    };

    const wildcardSession = getWildcardCookie('axim_session');
    if (wildcardSession) {
        setEvents([{
            id: 'wildcard-init',
            status: 'Wildcard Session Detected',
            user_id: 'SSO Active',
            timestamp: new Date().toISOString()
        }]);
    }
  }, []);

  useEffect(() => {
    const channel = supabase.channel('passport-verify-events');

    channel.unsubscribe(); // Cleanup any existing before subscribing
    channel
      .on('broadcast', { event: 'verification_status' }, (payload) => {
        setEvents((currentEvents) => [
          {
            id: Date.now() + Math.random(),
            status: payload.payload.status,
            user_id: payload.payload.user_id,
            timestamp: new Date().toISOString(),
          },
          ...currentEvents,
        ].slice(0, 10));
        if (payload.payload.status === 'verified') {
          trackEvent('sso_handoff_success', { user_id: payload.payload.user_id });
          cleanseUrlHandoffToken();
        } else if (payload.payload.status === 'failed') {
          trackEvent('sso_handoff_failure', { user_id: payload.payload.user_id });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    // Capture incoming ?token=... from the callback URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
        const verifyToken = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/passport-verify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ token })
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.axim_session_token) {
                        localStorage.setItem('axim_session_token', data.axim_session_token);
                    }
                    setEvents([{
                        id: 'token-verify',
                        status: 'Verified',
                        user_id: data.user_id || 'Unknown',
                        timestamp: new Date().toISOString()
                    }]);
                } else {
                    setEvents([{
                        id: 'token-verify-failed',
                        status: 'Verification Failed',
                        user_id: 'Unknown',
                        timestamp: new Date().toISOString()
                    }]);
                }
            } catch (err) {
                console.error("Token verification error:", err);
            } finally {
                // Clean the URL via window.history.replaceState
                params.delete('token');
                window.history.replaceState({}, document.title, window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
            }
        };
        verifyToken();
    }
  }, []);

  const getStatusConfig = (status) => {
    switch (status) {
      case 'verified':
      case 'Verified':
        return { icon: FiCheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-900/20' };
      case 'failed':
      case 'Verification Failed':
        return { icon: FiXCircle, color: 'text-red-400', bg: 'bg-red-900/20' };
      case 'pending':
        return { icon: FiClock, color: 'text-amber-400', bg: 'bg-amber-900/20' };
      default:
        return { icon: FiShield, color: 'text-slate-400', bg: 'bg-slate-900/20' };
    }
  };

  return (
    <div className={`bg-onyx-950 border ${isOffline ? 'border-amber-500/50 opacity-80' : 'border-onyx-accent/20'} rounded-xl p-4 transition-all duration-300`}>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
        <span className="flex items-center">
          <SafeIcon icon={FiShield} className="mr-2 text-indigo-400" />
          Passport Verifications
        </span>
        {isOffline && <span className="text-xs font-mono text-amber-400 animate-pulse border border-amber-400/30 px-2 py-0.5 rounded bg-amber-400/10">Offline</span>}
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No recent verifications.</p>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {events.map((event) => {
              const config = getStatusConfig(event.status);
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center space-x-3 p-3 rounded-lg border border-onyx-accent/10 ${config.bg}`}
                >
                  <SafeIcon icon={config.icon} className={config.color} />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium capitalize">{event.status}</p>
                    <p className="text-xs text-slate-400 truncate">User: {event.user_id || 'Unknown'}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default PassportListener;
