// src/contexts/ConnectivityContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import connectivityManager from '../services/connectivityManager';

// eslint-disable-next-line react-refresh/only-export-components
export const ConnectivityContext = createContext({
  isOnline: true,
  offlineTelemetryCache: [],
  addOfflineTelemetry: () => {},
  clearOfflineTelemetry: () => {}
});

// eslint-disable-next-line react-refresh/only-export-components
export const useConnectivity = () => {
  return useContext(ConnectivityContext);
};

export const ConnectivityProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(connectivityManager.getIsOnline());
  const [offlineTelemetryCache, setOfflineTelemetryCache] = useState([]);

  const addOfflineTelemetry = (telemetryData) => {
    setOfflineTelemetryCache(prev => [...prev, telemetryData]);
  };

  const clearOfflineTelemetry = () => {
    setOfflineTelemetryCache([]);
  };

  useEffect(() => {
    const unsubscribe = connectivityManager.subscribe(setIsOnline);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{
      isOnline,
      offlineTelemetryCache,
      addOfflineTelemetry,
      clearOfflineTelemetry
    }}>
      {children}
    </ConnectivityContext.Provider>
  );
};
