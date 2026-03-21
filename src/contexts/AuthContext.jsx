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

  const handleSession = useCallback(async (session) => {
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    setIsAuthenticated(!!session);

    if (currentUser) {
      const { data: userRole } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.id)
        .single();
      setRole(userRole?.role || 'user');
      await loadUserSettings(currentUser);
    } else {
      setRole(null);
      loadUserSettings(null);
    }
  }, [supabase, loadUserSettings]);

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

  const login = async (email, password) => {
    console.log('[AuthContext] Attempting login for:', email);
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
