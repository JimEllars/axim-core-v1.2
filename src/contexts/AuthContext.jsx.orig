import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSupabase } from './SupabaseContext';
import api from '../services/onyxAI/api';
import config from '../config';
import toast from 'react-hot-toast';

export const AuthContext = createContext();

const MOCK_USER = {
  id: 'mock-user-id-12345',
  email: 'admin@example.com',
  app_metadata: {
    provider: 'email',
    providers: ['email'],
  },
  user_metadata: {
    full_name: 'Mock Admin',
  },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { supabase } = useSupabase();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [settings, setSettings] = useState(null);
  const [aximSessionToken, setAximSessionToken] = useState(null);

  const loadUserSettings = useCallback(async (currentUser) => {
    if (config.isMockLlmEnabled) {
      setSettings({ theme: 'dark', notifications: true }); // Example mock settings
      return;
    }
    if (!currentUser) {
      setSettings(null);
      return;
    }
    try {
      const userSettings = await api.getUserSettings(currentUser.id);
      setSettings(userSettings);
    } catch (error) {
      toast.error("Failed to load user settings.");
      setSettings({}); // Default to empty object on error
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
          'Content-Type': 'application/json'
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
      console.error("Failed to refresh AXiM session token:", error);
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
        let currentRole = currentUser.app_metadata?.role;
        if (!currentRole) {
           const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
           if (roleData?.role) {
               currentRole = roleData.role;
           } else {
               const { data: pubUser } = await supabase.from('users').select('role').eq('id', currentUser.id).maybeSingle();
               if (pubUser?.role) currentRole = pubUser.role;
           }
        }
        setRole(currentRole || 'user');
      } catch(e) {
         setRole('user');
      }

      await loadUserSettings(currentUser);
      await refreshAximSession(session);
    } else {
      setRole(null);
      loadUserSettings(null);
      await refreshAximSession(null);
    }
  }, [supabase, loadUserSettings, refreshAximSession]);

  useEffect(() => {
    const isMock = config.isMockLlmEnabled;

    if (isMock) {
      setUser(MOCK_USER);
      setIsAuthenticated(true);
      setRole('admin');
      loadUserSettings(MOCK_USER);
      setLoading(false);
      return;
    }

    if (!supabase) {
      setLoading(false);
      return;
    };

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
      setLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await handleSession(session);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, handleSession, loadUserSettings]);


  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email, password) => {
    console.log('[AuthContext] Attempting login for:', email);

    // Strict internal domain check
    if (!email.endsWith('@axim.us.com')) {
      throw new Error('Access Denied. AXiM Internal Systems are for authorized personnel only.');
    }

    if (config.isMockLlmEnabled) {
      console.log('[AuthContext] Mock mode enabled. Faking login.');
      setUser({ ...MOCK_USER, email });
      setIsAuthenticated(true);
      setRole('admin');
      await loadUserSettings(MOCK_USER);
      return;
    }
    try {
      console.log('[AuthContext] Calling supabase.auth.signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[AuthContext] Supabase response data:', data, 'error:', error);
      if (error) {
        console.error('[AuthContext] Login error from Supabase:', error);
        throw error;
      }
    } catch (err) {
      console.error('[AuthContext] Caught error during login:', err);
      throw err;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    isAuthenticated,
    role,
    settings,
    aximSessionToken,
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
