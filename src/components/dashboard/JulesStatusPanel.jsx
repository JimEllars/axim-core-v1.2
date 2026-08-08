import React, { useState } from 'react';
import { useJulesSession } from '../../hooks/useJulesSession';
import { julesApi } from '../../services/jules/julesApi';
import toast from 'react-hot-toast';
import { FiCpu, FiCheckCircle, FiLoader, FiAlertTriangle, FiGithub, FiSend } from 'react-icons/fi';

const JulesStatusPanel = ({ activeSessionId }) => {
  const { session, state, error, activities } = useJulesSession(activeSessionId);
  const [replyPrompt, setReplyPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleApprove = async () => {
    const success = await julesApi.approvePlan(activeSessionId);
    if (success) {
      toast.success("Jules Plan Approved");
    } else {
      toast.error("Failed to approve Jules plan");
    }
  };

  const handleSendReply = async () => {
    if (!replyPrompt.trim()) return;
    setIsSending(true);
    try {
      await julesApi.sendMessage(activeSessionId, replyPrompt);
      toast.success("Message sent to Jules");
      setReplyPrompt('');
    } catch (err) {
      toast.error("Failed to send message to Jules");
    } finally {
      setIsSending(false);
    }
  };

  if (!activeSessionId) {
    return (
      <div className="glass-effect rounded-xl p-6 border border-onyx-accent/20 h-full flex flex-col items-center justify-center text-slate-400">
        <FiCpu className="w-12 h-12 mb-4 opacity-50" />
        <p className="font-mono text-sm uppercase tracking-wider">No active Jules coding sessions</p>
      </div>
    );
  }

  const getStatusColor = () => {
    switch (state) {
      case 'QUEUED':
      case 'PLANNING':
      case 'IN_PROGRESS':
        return 'text-blue-400';
      case 'AWAITING_PLAN_APPROVAL':
      case 'AWAITING_USER_FEEDBACK':
        return 'text-amber-400';
      case 'COMPLETED':
        return 'text-emerald-400';
      case 'FAILED':
        return 'text-rose-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = () => {
    switch (state) {
      case 'QUEUED':
      case 'PLANNING':
      case 'IN_PROGRESS':
        return <FiLoader className="w-5 h-5 animate-spin" />;
      case 'AWAITING_PLAN_APPROVAL':
      case 'AWAITING_USER_FEEDBACK':
        return <FiAlertTriangle className="w-5 h-5 animate-pulse" />;
      case 'COMPLETED':
        return <FiCheckCircle className="w-5 h-5" />;
      case 'FAILED':
        return <FiAlertTriangle className="w-5 h-5" />;
      default:
        return <FiCpu className="w-5 h-5" />;
    }
  };

  return (
    <div className="glass-effect rounded-xl p-6 border border-onyx-accent/20 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-black/20 border border-white/10 ${getStatusColor()}`}>
            {getStatusIcon()}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Jules Session Tracker</h3>
            <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">Active Context</p>
          </div>
        </div>

        {state && (
          <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider bg-black/30 border border-white/10 ${getStatusColor()}`}>
            {state}
          </div>
        )}
      </div>

      {error ? (
        <div className="flex-grow flex flex-col items-center justify-center text-rose-400 text-sm p-4 bg-rose-500/10 rounded-lg border border-rose-500/20">
          <FiAlertTriangle className="w-8 h-8 mb-2" />
          <p>Failed to load session data</p>
          <p className="text-xs opacity-70 mt-1">{error.message}</p>
        </div>
      ) : session ? (
        <div className="flex-grow flex flex-col space-y-4 max-h-full overflow-hidden">
          <div>
            <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-1">Title</h4>
            <p className="text-white text-sm font-medium truncate">{session.title || 'Untitled Session'}</p>
          </div>

          <div className="flex-grow flex flex-col overflow-hidden">
            <h4 className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-1">Activity Log</h4>
            <div className="flex-grow bg-black/30 p-3 rounded-lg border border-white/5 overflow-y-auto space-y-2">
              {activities && activities.length > 0 ? (
                activities.map((activity, index) => (
                  <div key={index} className="text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <span className="text-blue-400 font-mono mr-2">
                      [{new Date(activity.createTime).toLocaleTimeString()}]
                    </span>
                    <span className="text-slate-300">
                      {activity.planGenerated ? 'Plan Generated' :
                       activity.progressUpdated ? 'Progress Updated' :
                       activity.agentMessaged ? 'Agent Messaged' : 'Activity'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 italic">No activities yet.</div>
              )}
            </div>
          </div>

          <div className="pt-2 space-y-3 shrink-0">
            {state === 'AWAITING_PLAN_APPROVAL' && (
              <button
                onClick={handleApprove}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all font-mono text-sm font-bold uppercase tracking-wider"
              >
                <FiCheckCircle />
                Approve Plan
              </button>
            )}

            <div className={`flex flex-col gap-2 p-3 rounded-lg border ${state === 'AWAITING_USER_FEEDBACK' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20 border-white/10'}`}>
              <textarea
                value={replyPrompt}
                onChange={(e) => setReplyPrompt(e.target.value)}
                placeholder="Send a message to Jules..."
                className="w-full bg-transparent border-0 text-sm text-white focus:ring-0 resize-none h-16 p-0"
              />
              <button
                onClick={handleSendReply}
                disabled={isSending || !replyPrompt.trim()}
                className="self-end flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-all font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? <FiLoader className="animate-spin" /> : <FiSend />}
                Send Reply
              </button>
            </div>

            {session.outputs && session.outputs.pullRequest && (
              <a
                href={session.outputs.pullRequest}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-mono text-sm font-bold uppercase tracking-wider"
              >
                <FiGithub />
                View Pull Request
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-center text-slate-400">
          <FiLoader className="w-8 h-8 animate-spin opacity-50" />
        </div>
      )}
    </div>
  );
};

export default JulesStatusPanel;
