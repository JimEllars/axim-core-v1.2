import React, { useState } from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiMail, FiSend, FiX } = FiIcons;

const InviteUserModal = ({ onClose, onInvite }) => {
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsInviting(true);
    await onInvite(email);
    setIsInviting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-effect rounded-xl p-8 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Invite New User</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <SafeIcon icon={FiX} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SafeIcon icon={FiMail} className="text-slate-400" />
                </div>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400"
                  placeholder="new.user@example.com"
                  required
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-4 mt-6">
            <motion.button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={isInviting}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
            >
              <SafeIcon icon={FiSend} className="inline mr-2" />
              {isInviting ? 'Sending Invite...' : 'Send Invite'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default InviteUserModal;