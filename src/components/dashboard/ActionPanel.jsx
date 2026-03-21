import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';

const { FiPlus, FiUser, FiMail, FiSend, FiCheck, FiX, FiChevronDown, FiBriefcase, FiRefreshCw } = FiIcons;

const ActionPanel = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('ingestLead');
  const { refreshDashboard } = useDashboard();

  const handleRecalculateMetrics = async () => {
    const promise = api.recalculateMetrics();
    toast.promise(promise, {
      loading: 'Recalculating metrics...',
      success: 'Metrics recalculated successfully!',
      error: 'Failed to recalculate metrics.',
    });
    try {
      await promise;
      refreshDashboard();
    } catch (error) {
      console.error('Error recalculating metrics:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl overflow-hidden"
    >
      <div
        className="flex items-center justify-between p-6 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <SafeIcon icon={FiPlus} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Action Panel</h2>
            <p className="text-sm text-slate-400">Manual operations and data injection</p>
          </div>
        </div>
        
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <SafeIcon icon={FiChevronDown} className="text-slate-400" />
        </motion.div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-onyx-accent/20"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-1 bg-onyx-950/50 p-1 rounded-lg">
                  <TabButton
                    label="Ingest Lead"
                    isActive={activeTab === 'ingestLead'}
                    onClick={() => setActiveTab('ingestLead')}
                  />
                  <TabButton
                    label="Create Project"
                    isActive={activeTab === 'createProject'}
                    onClick={() => setActiveTab('createProject')}
                  />
                </div>
                <motion.button
                  onClick={handleRecalculateMetrics}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center space-x-2 px-4 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 text-white rounded-lg text-sm transition-colors"
                >
                  <SafeIcon icon={FiRefreshCw} />
                  <span>Recalculate Metrics</span>
                </motion.button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'ingestLead' && <IngestLeadForm />}
                  {activeTab === 'createProject' && <CreateProjectForm />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const TabButton = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive ? 'bg-onyx-950 text-white' : 'text-slate-400 hover:bg-onyx-accent/20'
    }`}
  >
    {label}
  </button>
);

const IngestLeadForm = () => {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const { refreshDashboard } = useDashboard();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      await api.addContact(formData.name, formData.email, 'manual_dashboard_ingest');
      setSubmitStatus('success');
      setFormData({ name: '', email: '' });
      refreshDashboard();
    } catch (error) {
      console.error('Error adding contact:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 3000);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Name"
          icon={FiUser}
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="Enter contact name"
          required
        />
        <InputField
          label="Email"
          type="email"
          icon={FiMail}
          value={formData.email}
          onChange={(e) => handleInputChange('email', e.target.value)}
          placeholder="Enter email address"
          required
        />
      </div>
      <FormControls
        isSubmitting={isSubmitting}
        submitStatus={submitStatus}
        submitLabel="Ingest Lead"
        successMessage="Lead ingested successfully!"
        errorMessage="Failed to ingest lead"
        canSubmit={!!formData.email}
      />
    </form>
  );
};

const CreateProjectForm = () => {
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const { refreshDashboard } = useDashboard();
  const { user } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      await api.createProject(formData.name, formData.description, user.id);
      setSubmitStatus('success');
      setFormData({ name: '', description: '' });
      refreshDashboard();
    } catch (error) {
      console.error('Error creating project:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 3000);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <InputField
          label="Project Name"
          icon={FiBriefcase}
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="Enter project name"
          required
        />
        <InputField
          label="Project Description"
          icon={FiBriefcase}
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="Enter a brief description"
        />
      </div>
      <FormControls
        isSubmitting={isSubmitting}
        submitStatus={submitStatus}
        submitLabel="Create Project"
        successMessage="Project created successfully!"
        errorMessage="Failed to create project"
        canSubmit={!!formData.name}
      />
    </form>
  );
};

const InputField = ({ label, icon, ...props }) => (
  <div>
    <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <SafeIcon icon={icon} className="text-slate-400 text-sm" />
      </div>
      <input
        {...props}
        className="w-full pl-10 pr-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-slate-400"
      />
    </div>
  </div>
);

const FormControls = ({ isSubmitting, submitStatus, submitLabel, successMessage, errorMessage, canSubmit }) => (
  <div className="flex items-center justify-between">
    <motion.button
      type="submit"
      disabled={isSubmitting || !canSubmit}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
    >
      {isSubmitting ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Processing...</span>
        </>
      ) : (
        <>
          <SafeIcon icon={FiSend} />
          <span>{submitLabel}</span>
        </>
      )}
    </motion.button>

    <AnimatePresence>
      {submitStatus && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            submitStatus === 'success'
              ? 'bg-green-900/30 border border-green-800 text-green-400'
              : 'bg-red-900/30 border border-red-800 text-red-400'
          }`}
        >
          <SafeIcon icon={submitStatus === 'success' ? FiCheck : FiX} />
          <span className="text-sm">
            {submitStatus === 'success' ? successMessage : errorMessage}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default ActionPanel;