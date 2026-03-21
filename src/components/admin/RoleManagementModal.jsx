import React, { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiSave, FiX, FiShield } = FiIcons;

const RoleManagementModal = ({ user, onClose, onRoleUpdate }) => {
  const [newRole, setNewRole] = useState(user.role);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await api.updateUserRole(user.id, newRole);
      onRoleUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="glass-effect rounded-xl p-8 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Change User Role</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <SafeIcon icon={FiX} />
          </button>
        </div>

        <p className="text-slate-300 mb-4">
          Change the role for <span className="font-semibold text-white">{user.email}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiShield} className="mr-2" />
              Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-4 pt-6">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="px-6 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
            >
              <SafeIcon icon={FiSave} className="inline mr-2" />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default RoleManagementModal;
