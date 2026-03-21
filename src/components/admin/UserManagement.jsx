import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import RoleManagementModal from './RoleManagementModal';
import InviteUserModal from './InviteUserModal';

const { FiUsers, FiEdit, FiTrash2, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight } = FiIcons;

const USERS_PER_PAGE = 10;

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }
    if (userToDelete && userToDelete.id === user.id) {
      const toastId = toast.loading('Deleting user...');
      try {
        await api.deleteUser(user.id);
        toast.success('User deleted successfully', { id: toastId });
        fetchUsers();
        setUserToDelete(null);
      } catch (err) {
        toast.error(`Failed to delete user: ${err.message}`, { id: toastId });
      }
    } else {
      setUserToDelete(user);
      toast('Click again to confirm deletion', { icon: '⚠️' });
    }
  };

  const handleEditUser = (user) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot edit your own account.");
      return;
    }
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const handleRoleUpdate = () => {
    fetchUsers();
    handleCloseModal();
  }

  const handleInviteUser = async (email) => {
    const toastId = toast.loading('Sending invitation...');
    try {
      await api.inviteUser(email);
      toast.success('Invitation sent successfully!', { id: toastId });
      setIsInviteModalOpen(false);
    } catch (err) {
      toast.error(`Failed to send invitation: ${err.message}`, { id: toastId });
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      toast.error(`Failed to fetch users: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="glass-effect rounded-xl">
      <div className="p-6 border-b border-onyx-accent/20 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-semibold text-white flex items-center">
          <SafeIcon icon={FiUsers} className="mr-3 text-blue-400" />
          User Management
        </h2>
        <div className="flex space-x-2">
            <button onClick={() => setIsInviteModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Invite User
            </button>
            <button onClick={fetchUsers} disabled={loading} className="p-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg transition-colors disabled:opacity-50">
              <SafeIcon icon={FiRefreshCw} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SafeIcon icon={FiSearch} className="text-slate-400" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-onyx-950/50">
            <tr>
              <th scope="col" className="px-6 py-3">User</th>
              <th scope="col" className="px-6 py-3">Role</th>
              <th scope="col" className="px-6 py-3">Created At</th>
              <th scope="col" className="px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center p-8">
                  <p>Loading users...</p>
                </td>
              </tr>
            ) : (
              paginatedUsers.map((user) => (
                <tr key={user.id} className="border-b border-onyx-accent/20 hover:bg-onyx-accent/10">
                  <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">
                    {user.email}
                  </th>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-900/50 text-purple-300'
                        : 'bg-onyx-950 text-slate-300'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">{formatDate(user.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        disabled={user.id === currentUser?.id}
                        className={`p-2 rounded-lg transition-colors ${
                          user.id === currentUser?.id
                            ? 'text-slate-500 cursor-not-allowed'
                            : 'text-yellow-400 hover:bg-yellow-600/20'
                        }`}
                        aria-label={`Edit user ${user.email}`}
                        title={user.id === currentUser?.id ? "You cannot edit your own role." : ""}
                      >
                        <SafeIcon icon={FiEdit} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={user.id === currentUser?.id}
                        className={`p-2 rounded-lg transition-colors ${
                          user.id === currentUser?.id
                            ? 'text-slate-500 cursor-not-allowed'
                            : userToDelete && userToDelete.id === user.id
                            ? 'bg-red-500 text-white'
                            : 'text-red-400 hover:bg-red-600/20'
                        }`}
                        aria-label={
                          userToDelete && userToDelete.id === user.id
                            ? `Confirm delete user ${user.email}`
                            : `Delete user ${user.email}`
                        }
                        title={user.id === currentUser?.id ? "You cannot delete your own account." : ""}
                      >
                        <SafeIcon icon={FiTrash2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="p-6 border-t border-onyx-accent/20 flex justify-between items-center">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-onyx-950/50 text-white rounded-lg hover:bg-onyx-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <SafeIcon icon={FiChevronLeft} className="mr-2" />
            Previous
          </button>
          <span className="text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-onyx-950/50 text-white rounded-lg hover:bg-onyx-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            Next
            <SafeIcon icon={FiChevronRight} className="ml-2" />
          </button>
        </div>
      )}

      {isModalOpen && selectedUser && (
        <RoleManagementModal
          user={selectedUser}
          onClose={handleCloseModal}
          onRoleUpdate={handleRoleUpdate}
        />
      )}

      {isInviteModalOpen && (
        <InviteUserModal
          onClose={() => setIsInviteModalOpen(false)}
          onInvite={handleInviteUser}
        />
      )}
    </div>
  );
};

export default UserManagement;
