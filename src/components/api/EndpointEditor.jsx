import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiPlus, FiTrash2, FiSave, FiX, FiType, FiLink, FiChevronsRight } = FiIcons;

const EndpointEditor = ({ endpoints, onChange }) => {
  const [localEndpoints, setLocalEndpoints] = useState(endpoints || []);
  const [newEndpoint, setNewEndpoint] = useState({ name: '', path: '', method: 'GET' });
  const [isAdding, setIsAdding] = useState(false);

  const handleAddEndpoint = () => {
    if (!newEndpoint.name || !newEndpoint.path) return;
    const updatedEndpoints = [...localEndpoints, newEndpoint];
    setLocalEndpoints(updatedEndpoints);
    onChange(updatedEndpoints);
    setNewEndpoint({ name: '', path: '', method: 'GET' });
    setIsAdding(false);
  };

  const handleDeleteEndpoint = (index) => {
    const updatedEndpoints = localEndpoints.filter((_, i) => i !== index);
    setLocalEndpoints(updatedEndpoints);
    onChange(updatedEndpoints);
  };

  return (
    <div>
      <h4 className="text-slate-300 text-sm font-medium mb-2">Endpoints</h4>
      <div className="space-y-3">
        {localEndpoints.map((endpoint, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-onyx-950/50 rounded-lg">
            <div className="flex items-center space-x-3">
              <span className={`px-2 py-1 rounded text-xs font-mono ${
                endpoint.method === 'GET' ? 'bg-green-900/30 text-green-400' :
                endpoint.method === 'POST' ? 'bg-blue-900/30 text-blue-400' :
                endpoint.method === 'PUT' ? 'bg-yellow-900/30 text-yellow-400' :
                'bg-red-900/30 text-red-400'
              }`}>
                {endpoint.method}
              </span>
              <span className="text-white font-medium">{endpoint.name}</span>
              <span className="text-slate-400 font-mono text-xs">{endpoint.path}</span>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteEndpoint(index)}
              className="p-1 text-slate-400 hover:text-red-400"
            >
              <SafeIcon icon={FiTrash2} />
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-onyx-accent/20 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newEndpoint.name}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                  placeholder="e.g., Get Users"
                  className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Path</label>
                <input
                  type="text"
                  value={newEndpoint.path}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, path: e.target.value })}
                  placeholder="/users"
                  className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Method</label>
                <select
                  value={newEndpoint.method}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, method: e.target.value })}
                  className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                  <option>PATCH</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1 text-sm bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-md text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddEndpoint}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded-md text-white"
              >
                <SafeIcon icon={FiPlus} className="inline mr-1" />
                Add Endpoint
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isAdding && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-4 w-full text-center py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg text-sm text-blue-400 transition-colors"
        >
          <SafeIcon icon={FiPlus} className="inline mr-2" />
          Add New Endpoint
        </button>
      )}
    </div>
  );
};

export default EndpointEditor;
