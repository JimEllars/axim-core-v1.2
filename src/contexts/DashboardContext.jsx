import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const DashboardContext = createContext();

export const useDashboard = () => useContext(DashboardContext);

export const DashboardProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState(null);

  const openDrawer = useCallback((widget) => {
    setSelectedWidget(widget);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedWidget(null);
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  const refreshDashboard = useCallback(() => {
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  const value = useMemo(() => ({
    activeTab,
    setActiveTab,
    isDrawerOpen,
    setIsDrawerOpen,
    selectedWidget,
    setSelectedWidget,
    openDrawer,
    closeDrawer,
    refreshKey,
    refreshDashboard,
  }), [
    activeTab,
    isDrawerOpen,
    selectedWidget,
    openDrawer,
    closeDrawer,
    refreshKey,
    refreshDashboard
  ]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};
