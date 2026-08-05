// src/contexts/ConnectivityContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import connectivityManager from '../services/connectivityManager';

// eslint-disable-next-line react-refresh/only-export-components
export const ConnectivityContext = createContext({
  edgeCapacity: null,
  edgeDegraded: false,
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
  const [edgeCapacity, setEdgeCapacity] = useState(null);
  const [edgeDegraded, setEdgeDegraded] = useState(false);
  const [offlineTelemetryCache, setOfflineTelemetryCache] = useState([]);

  const addOfflineTelemetry = (telemetryData) => {
    setOfflineTelemetryCache(prev => [...prev, telemetryData]);
  };

  const clearOfflineTelemetry = () => {
    setOfflineTelemetryCache([]);
  };

  useEffect(() => {
    const handleEdgeCapacityUpdate = (event) => {
      if (event.detail && event.detail.remaining) {
        setEdgeCapacity(event.detail.remaining);
        setEdgeDegraded(false);
      }
    };
    window.addEventListener('edge:ratelimit:update', handleEdgeCapacityUpdate);
    const handleEdgeDegraded = () => setEdgeDegraded(true);
    window.addEventListener('edge:degraded', handleEdgeDegraded);

    const handleEdgeHealthy = () => setEdgeDegraded(false);
    window.addEventListener('edge:healthy', handleEdgeHealthy);

    const unsubscribe = connectivityManager.subscribe(setIsOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('edge:ratelimit:update', handleEdgeCapacityUpdate);
      window.removeEventListener('edge:degraded', handleEdgeDegraded);
      window.removeEventListener('edge:healthy', handleEdgeHealthy);
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{
      isOnline,
      edgeCapacity,
      edgeDegraded,
      offlineTelemetryCache,
      addOfflineTelemetry,
      clearOfflineTelemetry
    }}>
      {children}
    </ConnectivityContext.Provider>
  );
};
