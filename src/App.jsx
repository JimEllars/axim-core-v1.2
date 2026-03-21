import React, { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CommandHub from './components/CommandHub';
import APIIntegrationCenter from './components/APIIntegrationCenter';
import AdminDashboard from './components/admin/AdminDashboard';
import Ingest from './components/ingest/Ingest';
import Settings from './components/settings/Settings';
import UserProfile from './components/UserProfile';
import MainLayout from './components/MainLayout';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useSupabase } from './contexts/SupabaseContext';
import ErrorBoundary from './components/ErrorBoundary';
import config from './config';
import onyxAI from './services/onyxAI';
import api from './services/onyxAI/api'; // Import the real api service
import connectivityManager from './services/connectivityManager'; // Import the real connectivity manager
import offlineManager from './services/offline'; // Import the real offline manager
import DeviceManager from './services/deviceManager';
import './App.css';

function ConnectionErrorDisplay({ error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-onyx-950 to-onyx-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect max-w-2xl w-full rounded-lg p-8 text-center"
      >
        <h1 className="text-3xl font-bold text-red-400 mb-4">Backend Connection Error</h1>
        <p className="text-slate-300 mb-6">
          Axim Core could not establish a connection with the Supabase backend.
          Please ensure your environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are correct and that the service is running.
        </p>
        <div className="bg-onyx-950/50 border border-onyx-accent/20 rounded-md p-4 text-left">
          <p className="text-sm text-slate-400 font-mono break-words">
            {error.message}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          Retry Connection
        </button>
      </motion.div>
    </div>
  );
}

function App() {
  const { isAuthenticated: realIsAuthenticated, loading: authLoading, user } = useAuth();
  const { supabase, connectionError, isConnectionChecked } = useSupabase();
  const location = useLocation();

  const isAuthenticated = config.isMockLlmEnabled ? true : realIsAuthenticated;

  useEffect(() => {
    if (isAuthenticated && !onyxAI.isInitialized && supabase) {
      const userId = config.isMockLlmEnabled ? 'mock-user-id' : user?.id;
      if (userId) {
        onyxAI.initialize(supabase, userId, { api, connectivityManager, offlineManager });
        DeviceManager.initialize(userId);
      }
    }

    return () => {
      DeviceManager.stopHeartbeat();
    };
  }, [isAuthenticated, onyxAI.isInitialized, supabase, user]);


  const loading = authLoading || !isConnectionChecked;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-onyx-950 via-purple-900 to-onyx-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-white text-xl"
        >
          Loading Axim Core...
        </motion.div>
      </div>
    );
  }

  if (connectionError) {
    return <ConnectionErrorDisplay error={connectionError} />;
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="command-hub" element={<CommandHub />} />
          <Route path="api-center" element={<APIIntegrationCenter />} />
          <Route path="ingest" element={<Ingest />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<UserProfile />} />
          <Route
            path="admin"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default App;
