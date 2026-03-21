// src/contexts/ConnectivityContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import connectivityManager from '@/services/connectivityManager';

export const ConnectivityContext = createContext(true);

export const useConnectivity = () => {
  return useContext(ConnectivityContext);
};

export const ConnectivityProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(connectivityManager.getIsOnline());

  useEffect(() => {
    const unsubscribe = connectivityManager.subscribe(setIsOnline);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={isOnline}>
      {children}
    </ConnectivityContext.Provider>
  );
};
