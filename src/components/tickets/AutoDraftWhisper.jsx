import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

const AutoDraftWhisper = ({ logId, patchRecommendation, verificationScript, diagnosticPayload }) => {
  const [isApproving, setIsApproving] = useState(false);
  const [checkedItems, setCheckedItems] = useState({
    codeReview: false,
    keyVerification: false,
  });




  useEffect(() => {
    if (diagnosticPayload && diagnosticPayload.encryption_error) {
      // Dispatch an automated notification payload via SendFox to alert the engineering team of a blocked diagnostic session
      const sendAlert = async () => {
         try {
             // We use a backend edge function for security to avoid exposing API keys on the frontend
             await supabase.functions.invoke('alert-dispatcher', {
                 body: {
                     type: 'sendfox_alert',
                     alert: 'Encryption parsing failure detected in Tier 4 diagnostic session.',
                     logId: logId,
                     errorDetails: diagnosticPayload.encryption_error
                 }
             });
         } catch (err) {
             console.error("Failed to dispatch alert:", err);
         }
      };
      sendAlert();
    }
  }, [diagnosticPayload, logId]);





  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const { data, error } = await supabase.rpc('resolve_hitl_action', {
        p_log_id: logId,
        p_status: 'Approved',
        p_action_payload: { action: 'deploy_patch_and_reauthorize' }
      });
      if (error) throw error;
      alert('Patch deployed and node re-authorized successfully.');
    } catch (err) {
      alert('Failed to resolve HITL action: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const allChecked = checkedItems.codeReview && checkedItems.keyVerification;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-gray-200 font-semibold mb-4 text-sm tracking-wide">Auto-Drafted Resolution Plan</h3>

      <div className="space-y-4 mb-6">
        <label className="flex items-start space-x-3 cursor-pointer group">
          <div className="flex-shrink-0 mt-1">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500/50 bg-gray-700"
              checked={checkedItems.codeReview}
              onChange={(e) => setCheckedItems({ ...checkedItems, codeReview: e.target.checked })}
            />
          </div>
          <div>
            <span className="block text-sm text-gray-300 font-medium group-hover:text-white transition-colors">Review Code Adjustment Draft</span>
            <div className="mt-1 p-3 bg-gray-900 border border-gray-700 rounded-md font-mono text-xs text-green-400 overflow-x-auto">
              {patchRecommendation || "// No patch recommended yet."}
            </div>
          </div>
        </label>

        <label className="flex items-start space-x-3 cursor-pointer group">
          <div className="flex-shrink-0 mt-1">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500/50 bg-gray-700"
              checked={checkedItems.keyVerification}
              onChange={(e) => setCheckedItems({ ...checkedItems, keyVerification: e.target.checked })}
            />
          </div>
          <div>
            <span className="block text-sm text-gray-300 font-medium group-hover:text-white transition-colors">Verify Deployment Keys & Automation Script</span>
            <div className="mt-1 p-3 bg-gray-900 border border-gray-700 rounded-md font-mono text-xs text-blue-400 overflow-x-auto">
              {verificationScript || "# Run deployment verification..."}
            </div>
          </div>
        </label>
      </div>

      <div className="pt-4 border-t border-gray-700 flex justify-end">
        <button
          onClick={handleApprove}
          disabled={!allChecked || isApproving}
          className={`px-6 py-2 rounded-md text-sm font-semibold transition-all shadow-md ${
            allChecked && !isApproving
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isApproving ? 'Authorizing...' : 'Approve & Deploy Patch'}
        </button>
      </div>
    </div>
  );
};

export default AutoDraftWhisper;
