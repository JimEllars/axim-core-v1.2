import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiZap, FiCheckCircle, FiXCircle, FiAlertTriangle } = FiIcons;

const WorkflowExecutionLog = () => {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExecutions = async () => {
      setLoading(true);
      try {
        const data = await api.getWorkflowExecutions();
        setExecutions(data);
      } catch (error) {
        console.error("Error fetching workflow executions:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchExecutions();
  }, []);

  const getStatusIcon = (execution) => {
    if (!execution.data?.results) {
      return <SafeIcon icon={FiAlertTriangle} className="text-yellow-400" title="Legacy Trigger or missing data" />;
    }
    const allSuccess = execution.data.results.every(r => r.success);
    return allSuccess
      ? <SafeIcon icon={FiCheckCircle} className="text-green-500" />
      : <SafeIcon icon={FiXCircle} className="text-red-500" />;
  };

  return (
    <div className="glass-effect rounded-xl">
      <div className="p-6 border-b border-onyx-accent/20">
        <h2 className="text-xl font-semibold text-white flex items-center">
          <SafeIcon icon={FiZap} className="mr-3 text-yellow-400" />
          Workflow Execution Log
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-onyx-950/50">
            <tr>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Workflow</th>
              <th scope="col" className="px-6 py-3">Source</th>
              <th scope="col" className="px-6 py-3">Executed At</th>
              <th scope="col" className="px-6 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center p-8">
                  <p>Loading execution logs...</p>
                </td>
              </tr>
            ) : executions.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-8">
                  <p>No workflow executions found.</p>
                </td>
              </tr>
            ) : (
              executions.map((exec) => (
                <tr key={exec.id} className="border-b border-onyx-accent/20 hover:bg-onyx-accent/10">
                  <td className="px-6 py-4">{getStatusIcon(exec)}</td>
                  <td className="px-6 py-4 font-medium text-white">{exec.data?.workflow_name || 'N/A'}</td>
                  <td className="px-6 py-4">{exec.source || 'N/A'}</td>
                  <td className="px-6 py-4">{format(new Date(exec.created_at), 'PPpp')}</td>
                  <td className="px-6 py-4 text-xs">
                    {exec.data?.details ||
                     (exec.data?.results && `${exec.data.results.filter(r => r.success).length}/${exec.data.results.length} steps succeeded`) ||
                     'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkflowExecutionLog;