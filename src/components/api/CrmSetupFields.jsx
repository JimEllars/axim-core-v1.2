import React from 'react';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiBox, FiKey } = FiIcons;

const CrmSetupFields = ({ credentials, onCredentialChange }) => {
  const provider = credentials.provider || 'generic';

  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
          <SafeIcon icon={FiBox} className="mr-2" />
          CRM Provider
        </label>
        <select
          name="provider"
          value={provider}
          onChange={onCredentialChange}
          className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="generic">Generic CRM</option>
          <option value="salesforce">Salesforce</option>
          <option value="suitedash">Suitedash</option>
          <option value="hubspot" disabled>HubSpot (Coming Soon)</option>
        </select>
      </div>

      {provider === 'salesforce' && (
        <>
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              Client ID
            </label>
            <input
              type="text"
              name="client_id"
              value={credentials.client_id || ''}
              onChange={onCredentialChange}
              placeholder="Enter your Salesforce Client ID"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              Client Secret
            </label>
            <input
              type="password"
              name="client_secret"
              value={credentials.client_secret || ''}
              onChange={onCredentialChange}
              placeholder="Enter your Salesforce Client Secret"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {provider === 'suitedash' && (
        <>
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              Public ID
            </label>
            <input
              type="text"
              name="public_id"
              value={credentials.public_id || ''}
              onChange={onCredentialChange}
              placeholder="Enter your Suitedash Public ID"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="flex items-center text-slate-300 text-sm font-medium mb-2">
              <SafeIcon icon={FiKey} className="mr-2" />
              Secret Key
            </label>
            <input
              type="password"
              name="secret_key"
              value={credentials.secret_key || ''}
              onChange={onCredentialChange}
              placeholder="Enter your Suitedash Secret Key"
              className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default CrmSetupFields;