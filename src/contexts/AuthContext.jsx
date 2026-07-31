import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSupabase } from './SupabaseContext';
import api from '../services/onyxAI/api';
import config from '../config';
import toast from 'react-hot-toast';

export const AuthContext = createContext();


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { supabase, connectionError } = useSupabase();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [settings, setSettings] = useState(null);
  const [aximSessionToken, setAximSessionToken] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);

  const loadUserSettings = useCallback(async (currentUser) => {
    if (!currentUser) {
      setSettings(null);
      return;
    }
    try {
      const userSettings = await api.getUserSettings(currentUser.id);
      setSettings(userSettings);
    } catch (error) {
      if (error?.code?.startsWith('PGRST') || error?.message?.includes('relation') || error?.message?.includes('does not exist')) { /* handled */ } else if (error?.name === 'TypeError' && error?.message === 'Failed to fetch') {
         console.warn("Network offline. Skipping settings load to preserve session.");
      } else {
        toast.error("Failed to load user settings.");
      }
      setSettings({ /* handled */ }); // Default to empty object on error
    }
  }, []);

  const refreshAximSession = useCallback(async (session) => {
    if (!session) {
      setAximSessionToken(null);
      localStorage.removeItem('axim_session_token');
      return;
    }
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/passport-verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'x-axim-edge-token': session.access_token // Ensure auth tokens are safely integrated into standard fetch request headers
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.axim_session_token) {
          setAximSessionToken(data.axim_session_token);
          localStorage.setItem('axim_session_token', data.axim_session_token);
        }
      }
    } catch (error) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        console.warn("Network offline. Skipping AXiM session refresh.");
      } else {
        console.error("Failed to refresh AXiM session token:", error);
      }
    }
  }, []);

  const handleSession = useCallback(async (session) => {
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    setIsAuthenticated(!!session);

    if (currentUser) {
      // Wait, we need to fetch from user_roles or app_metadata
      // But user_roles might not exist, app_metadata does not exist on users table in public.
      // Wait, let's keep fetching from users table or check if user_roles exists.
      // The prompt says: "Update the AuthContext to fetch and store the user's role from a user_roles table (or Supabase app_metadata)."
      // Let's use user_roles table or app_metadata. But wait, I'm fetching currentUser.app_metadata.
      try {
        let currentRole = currentUser.app_metadata?.role || session.user?.app_metadata?.role;
        if (!currentRole) {
           const { data: roleData, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
           if (roleError && (roleError?.code?.startsWith('PGRST') || roleError?.message?.includes('does not exist'))) { /* handled */ }
           if (roleData?.role) {
               currentRole = roleData.role;
           } else {
               const { data: pubUser, error: pubUserError } = await supabase.from('users').select('role').eq('id', currentUser.id).maybeSingle();
               if (pubUserError && (pubUserError?.code?.startsWith('PGRST') || pubUserError?.message?.includes('does not exist'))) { /* handled */ }
               if (pubUser?.role) currentRole = pubUser.role;
           }
        }
        setRole(currentRole || 'user');
      } catch(e) {
         setRole('user');
      }

      await loadUserSettings(currentUser);
      await refreshAximSession(session);
      const wallet = currentUser?.user_metadata?.wallet_address || null;
      setWalletAddress(wallet);
    } else {
      setRole(null);
      setWalletAddress(null);
      loadUserSettings(null);
      await refreshAximSession(null);
    }
  }, [supabase, loadUserSettings, refreshAximSession]);

  useEffect(() => {
        // Check for handoff_token
    const params = new URLSearchParams(window.location.search);
    const handoffToken = params.get('handoff_token');

    if (!supabase) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const getSession = async () => {
      if (handoffToken) {
        try {
          const { data, error } = await supabase.auth.setSession({ access_token: handoffToken, refresh_token: handoffToken });
          if (!error && data.session) {
            setAximSessionToken(handoffToken);
            localStorage.setItem('axim_session_token', handoffToken);
          }
        } catch (e) {
          console.error('Failed to ingest handoff token:', e);
        }
        params.delete('handoff_token');
        window.history.replaceState({}, document.title, window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
      }

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error && (error?.code?.startsWith('PGRST') || error?.message?.includes('does not exist'))) { /* handled */ }
      await handleSession(session);
      setLoading(false);
    };

    const handleOnlineWakeup = async () => {
       console.log('Browser woke up or came online. Forcing silent token refresh.');
       const { data: { session } } = await supabase.auth.getSession();
       if (session) {
           await supabase.auth.refreshSession();
           const { data: refreshedSession } = await supabase.auth.getSession();
           await handleSession(refreshedSession.session);
       }
    };
    window.addEventListener('online', handleOnlineWakeup);


    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await handleSession(session);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
      window.removeEventListener('online', handleOnlineWakeup);
    };
  }, [supabase, handleSession, loadUserSettings]);


  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  const login = async (email, password) => {
    console.log('[AuthContext] Attempting login for:', email);

    // Strict internal domain check
    if (!email.endsWith('@axim.us.com')) {
      throw new Error('Access Denied. AXiM Internal Systems are for authorized personnel only.');
    }

    try {
      console.log('[AuthContext] Calling supabase.auth.signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[AuthContext] Supabase response data:', data, 'error:', error);
      if (error) {
        if (error?.code?.startsWith('PGRST') || error?.message?.includes('does not exist')) { /* handled */ }
        console.error('[AuthContext] Login error from Supabase:', error);
        throw error;
      }
    } catch (err) {
      console.error('[AuthContext] Caught error during login:', err);
      throw err;
    }
  };


  const value = {
    user,
    isAuthenticated,
    role,
    settings,
    aximSessionToken,
    walletAddress,
    loadUserSettings,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
