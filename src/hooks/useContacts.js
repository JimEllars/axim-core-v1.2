import { useState, useEffect, useCallback } from 'react';
import api from '../services/onyxAI/api';
import toast from 'react-hot-toast';
import config from '../config';
import { useDashboard } from '../contexts/DashboardContext';
import { useAuth } from '../contexts/AuthContext';

export const useContacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { refreshKey } = useDashboard();
  const { user } = useAuth();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    if (config.isMockLlmEnabled) {
      const mockContacts = [
        { id: 1, name: 'John Doe', email: 'john.doe@example.com', source: 'Website', created_at: new Date().toISOString() },
        { id: 2, name: 'Jane Smith', email: 'jane.smith@example.com', source: 'Referral', created_at: new Date().toISOString() },
        { id: 3, name: 'Sam Wilson', email: 'sam.wilson@example.com', source: 'Manual Entry', created_at: new Date().toISOString() },
      ];
      setContacts(mockContacts);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getContacts(searchTerm, user.id);
      setContacts(data);
    } catch (error) {
      toast.error('Failed to fetch contacts.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts, refreshKey]);

  const deleteContact = async (contactId) => {
    try {
      await api.deleteContactById(contactId);
      toast.success('Contact deleted successfully.');
      fetchContacts();
    } catch (error) {
      toast.error('Failed to delete contact.');
    }
  };

  const updateContact = async (contactId, data) => {
    try {
      await api.updateContactById(contactId, data);
      toast.success('Contact updated successfully.');
      fetchContacts();
    } catch (error) {
      toast.error('Failed to update contact.');
    }
  };

  return {
    contacts,
    loading,
    searchTerm,
    setSearchTerm,
    fetchContacts,
    deleteContact,
    updateContact,
  };
};
