import React from 'react';
import { DashboardProvider } from '../contexts/DashboardContext';
import DashboardContent from './dashboard/DashboardContent';

const Dashboard = () => (
  <DashboardProvider>
    <DashboardContent />
  </DashboardProvider>
);

export default Dashboard;
