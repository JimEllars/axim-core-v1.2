// src/components/settings/DeviceManager.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiHardDrive, FiEdit, FiTrash2, FiX } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../contexts/ApiContext';

const DeviceManager = () => {
  const { user } = useAuth();
  const { listDevices, updateDevice, deleteDevice, isLoading, error: apiError } = useApi();
  const [devices, setDevices] = useState([]);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [newDeviceName, setNewDeviceName] = useState('');

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const userDevices = await listDevices(user.id);
    if (userDevices) {
      setDevices(userDevices);
    }
    // Error handling is managed by the global ApiContext
  }, [user, listDevices]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const openRenameModal = (device) => {
    setSelectedDevice(device);
    setNewDeviceName(device.device_name);
    setIsRenameModalOpen(true);
  };

  const closeRenameModal = () => {
    setIsRenameModalOpen(false);
    setSelectedDevice(null);
    setNewDeviceName('');
  };

  const handleRenameDevice = async () => {
    if (!selectedDevice || !newDeviceName.trim()) {
      toast.error('Device name cannot be empty.');
      return;
    }
    const success = await updateDevice(selectedDevice.id, { device_name: newDeviceName.trim() });
    if (success) {
      toast.success('Device renamed successfully.');
      await fetchDevices(); // Refresh the list
      closeRenameModal();
    } else {
      toast.error('Failed to rename device.');
    }
  };

  const openDeleteModal = (device) => {
    setSelectedDevice(device);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedDevice(null);
  };

  const handleDeleteDevice = async () => {
    if (!selectedDevice) return;
    const success = await deleteDevice(selectedDevice.id);
    if (success) {
      toast.success('Device removed successfully.');
      await fetchDevices(); // Refresh the list
      closeDeleteModal();
    } else {
      toast.error('Failed to remove device.');
    }
  };

  const renderDeviceList = () => {
    if (isLoading) {
      return <p className="text-slate-400">Loading devices...</p>;
    }

    if (apiError) {
      return <p className="text-red-400">Error fetching devices: {apiError.message}</p>;
    }

    if (devices.length === 0) {
      return <p className="text-slate-400">No registered devices found.</p>;
    }

    return (
      <ul className="space-y-4">
        {devices.map((device) => (
          <li
            key={device.id}
            className="flex items-center justify-between p-4 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg"
          >
            <div>
              <p className="font-semibold text-white">{device.device_name}</p>
              <p className="text-sm text-slate-400">
                Status: <span className={`font-medium ${device.status === 'online' ? 'text-green-400' : 'text-slate-500'}`}>{device.status}</span>
              </p>
               <p className="text-xs text-slate-500 pt-1">Last Seen: {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => openRenameModal(device)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                aria-label="Rename device"
              >
                <FiEdit />
              </button>
              <button
                onClick={() => openDeleteModal(device)}
                className="p-2 text-red-500 hover:text-red-400 transition-colors"
                aria-label="Delete device"
              >
                <FiTrash2 />
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderModal = (isOpen, closeFn, title, onConfirm, content) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="glass-effect rounded-xl p-6 w-full max-w-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 id="modal-title" className="text-lg font-semibold text-white">{title}</h3>
            <button onClick={closeFn} className="text-slate-400 hover:text-white"><FiX /></button>
          </div>
          <div className="mb-6">{content}</div>
          <div className="flex justify-end space-x-4">
            <button onClick={closeFn} className="px-4 py-2 bg-onyx-950 text-white rounded-lg hover:bg-onyx-accent/10">Cancel</button>
            <button onClick={onConfirm} className={`px-4 py-2 ${title.includes('Delete') ? 'bg-red-600' : 'bg-blue-600'} text-white rounded-lg`}>
              {title.includes('Delete') ? 'Delete' : 'Save'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  };


  return (
    <div className="glass-effect rounded-xl p-6 mt-8">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
          <FiHardDrive className="text-white" />
        </div>
        <h2 className="text-lg font-semibold text-white">Device Management</h2>
      </div>
      {renderDeviceList()}

      {renderModal(
        isRenameModalOpen,
        closeRenameModal,
        'Rename Device',
        handleRenameDevice,
        <div>
          <label htmlFor="device-name" className="block text-sm font-medium text-slate-300 mb-2">
            New device name
          </label>
          <input
            type="text"
            id="device-name"
            aria-label="New device name"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            className="w-full pl-3 pr-10 py-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
            autoFocus
          />
        </div>
      )}

      {renderModal(
        isDeleteModalOpen,
        closeDeleteModal,
        'Delete Device',
        handleDeleteDevice,
        <p className="text-slate-300">
          Are you sure you want to remove the device "{selectedDevice?.device_name}"? This action cannot be undone.
        </p>
      )}

    </div>
  );
};

export default DeviceManager;