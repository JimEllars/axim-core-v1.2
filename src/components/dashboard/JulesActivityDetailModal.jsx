import React from 'react';
import { FiX, FiCheckCircle, FiEdit3, FiTerminal, FiMessageSquare } from 'react-icons/fi';

const JulesActivityDetailModal = ({ activity, onClose }) => {
  if (!activity) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-effect rounded-xl border border-onyx-accent/30 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto relative shadow-2xl shadow-onyx-accent/20">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-lg transition-colors border border-transparent hover:border-white/10"
        >
          <FiX className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <span className="text-blue-400">Activity Details</span>
          </h2>
          <div className="text-xs font-mono text-slate-400 tracking-wider">
            {new Date(activity.createTime).toLocaleString()}
          </div>
        </div>

        <div className="space-y-6">
          {activity.planGenerated && activity.planGenerated.plan && (
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                <FiCheckCircle /> Plan Generated
              </h3>
              <div className="space-y-4">
                {activity.planGenerated.plan.steps?.map((step, idx) => (
                  <div key={idx} className="bg-black/30 border border-white/5 p-4 rounded-lg">
                    <div className="text-sm font-bold text-white mb-1">
                      Step {idx + 1}: {step.title}
                    </div>
                    <div className="text-sm text-slate-300 whitespace-pre-wrap">
                      {step.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activity.progressUpdated && (
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3 flex items-center gap-2">
                <FiEdit3 /> Progress Updated
              </h3>
              <div className="bg-black/30 border border-white/5 p-4 rounded-lg">
                <div className="text-sm font-bold text-white mb-1">
                  {activity.progressUpdated.title}
                </div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap">
                  {activity.progressUpdated.description}
                </div>
              </div>
            </div>
          )}

          {activity.agentMessaged && (
            <div>
              <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <FiMessageSquare /> Agent Message
              </h3>
              <div className="bg-black/30 border border-white/5 p-4 rounded-lg">
                <div className="text-sm text-slate-300 whitespace-pre-wrap">
                  {activity.agentMessaged.message || activity.agentMessaged.agentMessage}
                </div>
              </div>
            </div>
          )}

          {activity.artifacts && activity.artifacts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-purple-400 mb-3 flex items-center gap-2">
                <FiTerminal /> Artifacts
              </h3>
              <div className="space-y-4">
                {activity.artifacts.map((artifact, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/10 rounded-lg overflow-hidden">
                     {artifact.type === 'GIT_DIFF' && artifact.gitDiff && (
                       <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                         {artifact.gitDiff}
                       </pre>
                     )}
                     {artifact.type === 'BASH' && artifact.bash && (
                       <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                         $ {artifact.bash.command}
                         {'\n'}
                         {artifact.bash.stdout}
                       </pre>
                     )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JulesActivityDetailModal;
