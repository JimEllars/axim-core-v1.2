import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSupabase } from './SupabaseContext';
import api from '../services/onyxAI/api';
import config from '../config';
import toast from 'react-hot-toast';
import DegradedModeAlert from '../components/common/DegradedModeAlert';

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
  const [isOffline, setIsOffline] = useState(false);
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

  const refreshAximSession = useCallback(async function refresh(session, attempt = 1) {
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
          'x-axim-edge-token': session.access_token
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.axim_session_token) {
          setAximSessionToken(data.axim_session_token);
          localStorage.setItem('axim_session_token', data.axim_session_token);
        }
        setIsOffline(false);
      } else if (response.status === 401) {
        // Explicit unauthorized, maybe trigger logout
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    } catch (error) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {

        console.warn(`Network offline. Skipping AXiM session refresh (Attempt ${attempt}).`);

        // Implement debounced 2-strike check before flipping offline mode
        if (attempt >= 2) {
            setIsOffline(true);
        }

        // Exponential backoff
        if (attempt <= 5) {
          setTimeout(() => refresh(session, attempt + 1), Math.pow(2, attempt) * 1000);
        }
      } else {
        console.error("Failed to refresh AXiM session token:", error);
      }
    }
  }, []);

  const handleSession = useCallback(async (session) => {
    const currentUser = session?.user ?? null;

    // Check if the user is identical to prevent state flickers on token refresh
    setUser(prevUser => {
      if (prevUser?.id === currentUser?.id && prevUser?.email === currentUser?.email) {
        return prevUser;
      }
      return currentUser;
    });

    setIsAuthenticated(!!session);

    if (currentUser) {
      try {
        let currentRole = currentUser.app_metadata?.role || session.user?.app_metadata?.role;

        const isSuperUser = currentUser.email === 'james.ellars@axim.us.com' || currentUser.email === 'jrellars@gmail.com';
        if (isSuperUser) {
            currentRole = 'admin';
        }
        if (!currentRole) {
           const { data: roleData, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
           if (roleData?.role) {
               currentRole = roleData.role;
           } else {
               const { data: pubUser, error: pubUserError } = await supabase.from('users').select('role').eq('id', currentUser.id).maybeSingle();
               if (pubUser?.role) currentRole = pubUser.role;
           }
        }
        setRole(prev => prev === (currentRole || 'user') ? prev : (currentRole || 'user'));
      } catch(e) {
         setRole(prev => prev === 'user' ? prev : 'user');
      }

      await refreshAximSession(session);

      const wallet = currentUser?.user_metadata?.wallet_address || null;
      setWalletAddress(prev => prev === wallet ? prev : wallet);

      // Load user settings only if they don't exist yet to prevent flickering
      setSettings(prev => {
        if (!prev) {
          loadUserSettings(currentUser);
        }
        return prev;
      });

    } else {
      setRole(null);
      setWalletAddress(null);
      setSettings(null);
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

    const getWildcardCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    };

    const wildcardSession = getWildcardCookie('axim_session');
    if (wildcardSession) {
        console.log('Detected AXiM wildcard session cookie');
        // We could validate this session with the backend, for now just note it
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
       setIsOffline(false);
       try {
         const { data: { session } } = await supabase.auth.getSession();
         if (session) {
             const { error } = await supabase.auth.refreshSession();
             if (error) throw error;
             // Only update if something changed, prevent flickering
             // The auth listener will likely catch this and trigger handleSession anyway,
             // but we'll leave it simple for resilience without unmounting
         }
       } catch (err) {
         console.warn("Failed silent token refresh on wakeup:", err);
         setIsOffline(true);
       }
    };
    window.addEventListener('online', handleOnlineWakeup);

    let offlineTimeout;
    window.addEventListener('offline', () => {
        offlineTimeout = setTimeout(() => setIsOffline(true), 2500);
    });
    window.addEventListener('online', () => {
        clearTimeout(offlineTimeout);
        handleOnlineWakeup();
    });



    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await handleSession(session);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
      window.removeEventListener('online', handleOnlineWakeup);
      // Removed offline listener to clear up any strict errors
    };
  }, [supabase, handleSession, loadUserSettings]);


  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error during Supabase sign out:', e);
    } finally {
      setAximSessionToken(null);
      setWalletAddress(null);
      setUser(null);
      setIsAuthenticated(false);
      setRole(null);
      setSettings(null);
      localStorage.removeItem('axim_session_token');
      // clear any potential handoff tokens or cross-domain remnants
      localStorage.removeItem('supabase.auth.token');
    }
  }, [supabase]);

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


  const disconnectWallet = useCallback(async () => {
    try {
      // If we have any thirdweb or wallet connection logic, clear it here.
      // For now, just clear local state and cache.
      setWalletAddress(null);
      localStorage.removeItem('axim_wallet_session');
      // If user metadata holds it, optionally update user in Supabase (not requested).
    } catch(e) {
      console.error('Error disconnecting wallet', e);
    }
  }, []);

  const value = {
    isOffline,
    user,
    isAuthenticated,
    role,
    settings,
    aximSessionToken,
    walletAddress,
    loadUserSettings,
    login,
    logout,
    disconnectWallet,
    loading
  };


    // Silent token renewal check
    useEffect(() => {
      let renewalTimer;
      const setupRenewal = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Check expiration
          const expiresAt = session.expires_at * 1000;
          const timeToExpiry = expiresAt - Date.now();
          // Renew 5 minutes before expiry
          const renewTime = timeToExpiry - 5 * 60 * 1000;

          if (renewTime > 0) {
            renewalTimer = setTimeout(async () => {
              if (!isOffline) {
                 await supabase.auth.refreshSession();
                 setupRenewal(); // Setup next renewal
              }
            }, renewTime);
          } else {
             // Already near expiry, try to refresh now
             if (!isOffline) {
                 await supabase.auth.refreshSession();
                 setupRenewal();
             }
          }
        }
      };

      if (isAuthenticated && !isOffline) {
         setupRenewal();
      }

      return () => clearTimeout(renewalTimer);
    }, [isAuthenticated, isOffline, supabase]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isOffline && <DegradedModeAlert />}
    </AuthContext.Provider>
  );
};
