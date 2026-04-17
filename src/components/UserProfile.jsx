import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/onyxAI/api';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../services/supabaseClient';
import { useQuery } from '@tanstack/react-query';

const { FiSave, FiUser, FiDownload, FiFileText } = FiIcons;

const UserProfile = () => {
  const { user, profile, loadUserProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    toast.loading('Updating profile...');

    try {
      await api.updateUserProfile(user.id, { full_name: fullName, avatar_url: avatarUrl });
      await loadUserProfile(user); // Refresh profile in context
      toast.dismiss();
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.dismiss();
      toast.error(`Failed to update profile: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['micro_app_transactions', user?.id, user?.email],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('micro_app_transactions')
        .select('*')
        .or(`user_identifier.eq.${user.email},user_identifier.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const handleDownload = async (transaction) => {
    try {
      const fileName = `generated_document_${transaction.stripe_session_id}.pdf`;
      const { data, error } = await supabase.storage
        .from('secure_artifacts')
        .createSignedUrl(fileName, 3600); // 1 hour expiry

      if (error) throw error;

      // Attempt to download the file
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.target = '_blank';
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Document downloaded successfully');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download document. It may have expired or not been generated correctly.');
    }
  };

  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">User Profile</h1>
          <p className="text-slate-400">Manage your profile information and AXiM Passport vault.</p>
        </div>

        <div className="flex space-x-4 mb-6 border-b border-onyx-accent/20 pb-2">
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'profile' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile Info
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'vault' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveTab('vault')}
          >
            Vaulted Records
          </button>
        </div>

        {activeTab === 'profile' && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <SafeIcon icon={FiUser} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">Profile Information</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SafeIcon icon={FiIcons.FiMail} className="text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full pl-10 pr-10 py-3 bg-onyx-950/30 border border-onyx-accent/20 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label htmlFor="full-name" className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SafeIcon icon={FiUser} className="text-slate-400" />
                </div>
                <input
                  id="full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-slate-400"
                  placeholder="Enter your full name"
                />
              </div>
            </div>
            <div>
              <label htmlFor="avatar-url" className="block text-sm font-medium text-slate-300 mb-2">Avatar URL</label>
              <div className="relative">
                <input
                  id="avatar-url"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full pl-3 pr-10 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-slate-400"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={isLoading}
                className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg disabled:opacity-50"
              >
                <SafeIcon icon={FiSave} className="mr-2" />
                {isLoading ? 'Saving...' : 'Save Profile'}
              </motion.button>
            </div>
          </form>
        </div>
        )}

        {activeTab === 'vault' && (
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <SafeIcon icon={FiFileText} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Vaulted Records</h2>
            </div>

            <p className="text-sm text-slate-400 mb-6">
              Documents and artifacts generated across AXiM Systems micro-apps are stored securely here.
            </p>

            {isLoadingTransactions ? (
              <div className="text-center py-8 text-slate-400">Loading your secure vault...</div>
            ) : transactions?.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border border-dashed border-onyx-accent/20 rounded-lg">
                No generated documents found.
              </div>
            ) : (
              <div className="space-y-4">
                {transactions?.map(tx => (
                  <div key={tx.id} className="bg-onyx-950/50 p-4 rounded-lg border border-onyx-accent/20 flex flex-col md:flex-row md:items-center justify-between">
                    <div>
                      <h3 className="font-medium text-white">{tx.product_id.replace(/_/g, ' ').toUpperCase()}</h3>
                      <p className="text-xs text-slate-400">Generated on {new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(tx)}
                      className="mt-4 md:mt-0 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 rounded-lg transition flex items-center justify-center"
                    >
                      <SafeIcon icon={FiDownload} className="mr-2" />
                      Download PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </motion.div>
    </div>
  );
};

export default UserProfile;
