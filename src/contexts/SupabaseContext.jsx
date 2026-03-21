import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import config from '../config';
import toast from 'react-hot-toast';

export const SupabaseContext = createContext();

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

export const SupabaseProvider = ({ children, client = null }) => {
  const [connectionError, setConnectionError] = useState(null);
  const [isConnectionChecked, setIsConnectionChecked] = useState(false);
  const supabaseClient = client || supabase;

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabaseClient.from('events_ax2024').select('*', { count: 'exact', head: true });
        if (error && !error.message.includes('relation "events_ax2024" does not exist')) {
          throw error;
        }
        setConnectionError(null);
      } catch (error) {
        toast.error("Supabase connection error.");
        setConnectionError(error);
      } finally {
        setIsConnectionChecked(true);
      }
    };

    if (client || config.isMockLlmEnabled) {
      setIsConnectionChecked(true);
      setConnectionError(null);
    } else {
      checkConnection();
    }
  }, [client, supabaseClient]);

  const value = {
    supabase: supabaseClient,
    connectionError,
    isConnectionChecked,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
};