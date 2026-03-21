import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabase } from '../../contexts/SupabaseContext';
import { callApiProxy } from '../../services/apiProxy';
import CodeBlock from './CodeBlock';

const { 
  FiPlay, FiCode, FiClock, FiCheckCircle, FiXCircle, 
  FiRefreshCw, FiDownload, FiCopy, FiSettings
} = FiIcons;

const APITestConsole = ({ integrations, selectedIntegration, onIntegrationChange }) => {
  const { supabase } = useSupabase();
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [requestBody, setRequestBody] = useState('{}');
  const [customHeaders, setCustomHeaders] = useState('{}');
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('request');

  useEffect(() => {
    if (selectedIntegration && selectedIntegration.endpoints?.length > 0) {
      setSelectedEndpoint(selectedIntegration.endpoints[0]);
    }
  }, [selectedIntegration]);

  const executeTest = async () => {
    if (!selectedIntegration || !selectedEndpoint) return;

    setIsLoading(true);
    const startTime = Date.now();

    try {
      const proxyResponse = await callApiProxy({
        integrationId: selectedIntegration.id,
        endpoint: selectedEndpoint.path,
        method: selectedEndpoint.method,
        body: JSON.parse(requestBody),
        headers: JSON.parse(customHeaders),
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const { status, data } = proxyResponse;

      const result = {
        id: Date.now(),
        integration_id: selectedIntegration.id,
        endpoint: selectedEndpoint.name,
        method: selectedEndpoint.method,
        url: `${selectedIntegration.base_url}${selectedEndpoint.path}`,
        request_data: JSON.parse(requestBody),
        response_data: data,
        status_code: status,
        response_time_ms: responseTime,
        success: status >= 200 && status < 300,
        timestamp: new Date(),
      };

      setTestResults(prev => [result, ...prev.slice(0, 9)]);

      // Log to database
      try {
        await supabase
          .from('api_call_logs_ax2024')
          .insert({
            integration_id: selectedIntegration.id,
            endpoint: selectedEndpoint.name,
            method: selectedEndpoint.method,
            request_data: result.request_data,
            response_data: result.response_data,
            status_code: result.status_code,
            response_time_ms: responseTime,
            success: result.success,
            triggered_by: 'test_console',
          });
      } catch (error) {
        console.error('Error logging API call:', error);
      }
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const result = {
        id: Date.now(),
        integration_id: selectedIntegration.id,
        endpoint: selectedEndpoint.name,
        method: selectedEndpoint.method,
        url: `${selectedIntegration.base_url}${selectedEndpoint.path}`,
        response_data: error.response?.data || { error: 'Request failed', message: error.message },
        status_code: error.response?.status || 500,
        response_time_ms: responseTime,
        success: false,
        timestamp: new Date(),
      };

      setTestResults(prev => [result, ...prev.slice(0, 9)]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const formatJSON = (obj) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const exportResults = () => {
    const data = testResults.map(result => ({
      timestamp: result.timestamp.toISOString(),
      endpoint: result.endpoint,
      method: result.method,
      url: result.url,
      status_code: result.status_code,
      response_time_ms: result.response_time_ms,
      success: result.success,
      request: result.request_data,
      response: result.response_data
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-test-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Integration & Endpoint Selection */}
      <div className="glass-effect rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">API Test Console</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Integration
            </label>
            <select
              value={selectedIntegration?.id || ''}
              onChange={(e) => {
                const integration = integrations.find(i => i.id === e.target.value);
                onIntegrationChange(integration);
              }}
              className="w-full px-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
            >
              <option value="">Choose an integration...</option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name} ({integration.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Endpoint
            </label>
            <select
              value={selectedEndpoint?.name || ''}
              onChange={(e) => {
                const endpoint = selectedIntegration?.endpoints?.find(ep => ep.name === e.target.value);
                setSelectedEndpoint(endpoint);
              }}
              disabled={!selectedIntegration || !selectedIntegration.endpoints?.length}
              className="w-full px-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white disabled:opacity-50"
            >
              <option value="">Choose an endpoint...</option>
              {selectedIntegration?.endpoints?.map((endpoint) => (
                <option key={endpoint.name} value={endpoint.name}>
                  {endpoint.method} {endpoint.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedIntegration && selectedEndpoint && (
          <div className="mt-6 p-4 bg-onyx-950/50 rounded-lg">
            <div className="flex items-center space-x-4 text-sm">
              <span className={`px-2 py-1 rounded text-xs font-mono ${
                selectedEndpoint.method === 'GET' ? 'bg-green-900/30 text-green-400' :
                selectedEndpoint.method === 'POST' ? 'bg-blue-900/30 text-blue-400' :
                selectedEndpoint.method === 'PUT' ? 'bg-yellow-900/30 text-yellow-400' :
                'bg-red-900/30 text-red-400'
              }`}>
                {selectedEndpoint.method}
              </span>
              <span className="text-slate-300 font-mono">
                {selectedIntegration.base_url}{selectedEndpoint.path}
              </span>
            </div>
          </div>
        )}
      </div>

      {selectedIntegration && selectedEndpoint && (
        <>
          {/* Request Configuration */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Request Configuration</h3>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={executeTest}
                disabled={isLoading}
                className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <SafeIcon icon={FiPlay} />
                    <span>Execute Test</span>
                  </>
                )}
              </motion.button>
            </div>

            <div className="flex space-x-2 mb-4">
              {['request', 'headers'].map((tab) => (
                <motion.button
                  key={tab}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-onyx-950/50 text-slate-300 hover:bg-onyx-accent/20'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </motion.button>
              ))}
            </div>

            {activeTab === 'request' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Request Body (JSON)
                </label>
                <textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={8}
                  className="w-full px-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg font-mono text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {activeTab === 'headers' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Custom Headers (JSON)
                </label>
                <textarea
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder='{"Content-Type": "application/json"}'
                  rows={8}
                  className="w-full px-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg font-mono text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Test Results */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Test Results</h3>
              <div className="flex items-center space-x-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={exportResults}
                  disabled={testResults.length === 0}
                  className="flex items-center space-x-2 px-3 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg text-slate-300 disabled:opacity-50"
                >
                  <SafeIcon icon={FiDownload} />
                  <span>Export</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTestResults([])}
                  disabled={testResults.length === 0}
                  className="flex items-center space-x-2 px-3 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg text-slate-300 disabled:opacity-50"
                >
                  <SafeIcon icon={FiRefreshCw} />
                  <span>Clear</span>
                </motion.button>
              </div>
            </div>

            {testResults.length > 0 ? (
              <div className="space-y-4">
                {testResults.map((result) => (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-onyx-accent/20 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <SafeIcon 
                          icon={result.success ? FiCheckCircle : FiXCircle} 
                          className={result.success ? 'text-green-400' : 'text-red-400'} 
                        />
                        <span className="text-white font-medium">
                          {result.method} {result.endpoint}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          result.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          {result.status_code}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-slate-400">
                        <div className="flex items-center space-x-1">
                          <SafeIcon icon={FiClock} />
                          <span>{result.response_time_ms}ms</span>
                        </div>
                        <span>{result.timestamp.toLocaleTimeString()}</span>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => copyToClipboard(formatJSON(result.response_data))}
                          className="p-1 hover:text-white"
                          title="Copy response"
                        >
                          <SafeIcon icon={FiCopy} />
                        </motion.button>
                      </div>
                    </div>

                    <div className="bg-onyx-950/50 rounded-lg p-3">
                      <CodeBlock code={formatJSON(result.response_data)} language="json" />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <SafeIcon icon={FiCode} className="text-4xl text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400 mb-2">No test results yet</p>
                <p className="text-sm text-slate-500">Execute a test to see the results here</p>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedIntegration && (
        <div className="glass-effect rounded-xl p-12">
          <div className="text-center">
            <SafeIcon icon={FiSettings} className="text-4xl text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">Select an integration to start testing</p>
            <p className="text-sm text-slate-500">Choose from your configured integrations above</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default APITestConsole;