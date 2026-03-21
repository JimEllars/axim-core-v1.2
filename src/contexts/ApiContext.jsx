import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import apiClient from '../services/apiClient';

const ApiContext = createContext();

export const useApi = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};

export const ApiProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isCloudMode = import.meta.env.VITE_APP_MODE === 'cloud';

  const handleApiCall = useCallback(async (apiCall) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiCall();
      return result;
    } catch (err) {
      console.error('API call failed:', err);
      setError(err);
      return false; // Revert to original error handling to avoid breaking changes
    } finally {
      setIsLoading(false);
    }
  }, []);

  const apiService = useMemo(() => {
    if (isCloudMode) {
      // Cloud mode uses the centralized apiClient
      return {
        addContact: (name, email, source, userId) => handleApiCall(() => apiClient.post('/contacts', { name, email, source, userId })),
        listAllContacts: (userId) => handleApiCall(() => apiClient.get('/contacts', { params: { userId } })),
        deleteContact: (email, userId) => handleApiCall(() => apiClient.delete(`/contacts/${email}`, { data: { userId } })),
        logAIInteraction: (interactionData) => handleApiCall(() => apiClient.post('/interactions', interactionData)),
        uploadFile: (fileData) => Promise.resolve(false), // Not implemented
        ingestData: (data) => Promise.resolve(false), // Not implemented
        sendMessageToOnyx: (message, userId) => handleApiCall(() => apiClient.post('/onyx/send', { message, userId })),
        listDevices: () => handleApiCall(() => apiClient.get('/devices')),
        updateDevice: (deviceId, updates) => handleApiCall(() => apiClient.put(`/devices/${deviceId}`, updates)),
        deleteDevice: (deviceId) => handleApiCall(() => apiClient.delete(`/devices/${deviceId}`)),
      };
    } else {
      // Electron mode uses IPC - window.electronAPI is correct per preload script
      return {
        addContact: (name, email, source, userId) => handleApiCall(() => window.electronAPI.invoke('db:addContact', { name, email, source, userId })),
        listAllContacts: (userId) => handleApiCall(() => window.electronAPI.invoke('db:listAllContacts', userId)),
        deleteContact: (email, userId) => handleApiCall(() => window.electronAPI.invoke('db:deleteContact', { email, userId })),
        logAIInteraction: (interactionData) => handleApiCall(() => window.electronAPI.invoke('db:logAIInteraction', interactionData)),
        uploadFile: (fileData) => handleApiCall(() => window.electronAPI.invoke('apix:upload', fileData)),
        ingestData: (data) => handleApiCall(() => window.electronAPI.invoke('axim:ingestData', data)),
        sendMessageToOnyx: (message) => handleApiCall(() => window.electronAPI.invoke('onyx:sendMessage', message)),
        listDevices: () => handleApiCall(() => window.electronAPI.invoke('device:list')),
        updateDevice: (deviceId, updates) => handleApiCall(() => window.electronAPI.invoke('device:update', { deviceId, updates })),
        deleteDevice: (deviceId) => handleApiCall(() => window.electronAPI.invoke('device:delete', deviceId)),
      };
    }
  }, [isCloudMode, handleApiCall]);


  const value = {
    isLoading,
    error,
    ...apiService,
  };

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};
