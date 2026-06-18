import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../ProtectedRoute';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import WorkflowExecutionLog from './WorkflowExecutionLog';
import UserManagement from './UserManagement';
import SystemHealthPanel from "./SystemHealthPanel";
import KPIOverview from './KPIOverview';
import WorkflowBuilder from './WorkflowBuilder';
import MemoryBank from './MemoryBank';
import IntelligenceHub from './IntelligenceHub';
import SecurityAudit from './SecurityAudit';
import ProductFeedback from './ProductFeedback';
import EcosystemRegistry from './EcosystemRegistry';
import BillingPortal from './BillingPortal';
import IntegrationsManager from './IntegrationsManager';
import EmailConsole from './EmailConsole';

const { FiLink, FiKey, FiUsers, FiCreditCard, FiGitMerge, FiBarChart2, FiLayers, FiDatabase, FiZap, FiShield, FiMessageSquare, FiBox, FiMail } = FiIcons;

const AdminDashboard = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FiBarChart2 },
    { id: 'users', label: 'User Management', icon: FiUsers },
    { id: 'workflows', label: 'Workflow Logs', icon: FiGitMerge },
    { id: 'builder', label: 'Workflow Builder', icon: FiLayers },
    { id: 'memory', label: 'Memory Bank', icon: FiDatabase },
    { id: 'intelligence', label: 'Intelligence Hub', icon: FiZap },
    { id: 'feedback', label: 'Product Feedback', icon: FiMessageSquare },
    { id: 'audit', label: 'Security Audit', icon: FiShield },
    { id: 'ecosystem', label: 'Ecosystem Registry', icon: FiBox },
    { id: 'integrations', label: 'Integrations & Webhooks', icon: FiLink },
    { id: 'billing', label: 'Fulfillment', icon: FiBox },
    { id: 'email', label: 'Email Console', icon: FiMail },
  ];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-slate-400">Manage internal systems, users, and infrastructure.</p>
        </div>

        <div className="flex space-x-2 border-b border-onyx-accent/20 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <SafeIcon icon={tab.icon} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        <div>
          {activeTab === 'overview' && <>
              <SystemHealthPanel />
              <div className="mt-8">
                <KPIOverview />
              </div>
            </>}
          {activeTab === 'users' && <UserManagement currentUser={currentUser} />}
          {activeTab === 'workflows' && <WorkflowExecutionLog />}
          {activeTab === 'builder' && <WorkflowBuilder />}
          {activeTab === 'memory' && <MemoryBank />}
          {activeTab === 'intelligence' && <IntelligenceHub />}
          {activeTab === 'feedback' && <ProductFeedback />}
          {activeTab === 'audit' && <ProtectedRoute allowedRoles={['admin']}><SecurityAudit /></ProtectedRoute>}
          {activeTab === 'ecosystem' && <ProtectedRoute allowedRoles={['admin']}><EcosystemRegistry /></ProtectedRoute>}
          {activeTab === 'integrations' && <ProtectedRoute allowedRoles={['admin']}><IntegrationsManager /></ProtectedRoute>}
          {activeTab === 'billing' && <ProtectedRoute allowedRoles={['admin']}><BillingPortal /></ProtectedRoute>}
          {activeTab === 'email' && <ProtectedRoute allowedRoles={['admin']}><EmailConsole /></ProtectedRoute>}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
