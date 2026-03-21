import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiCpu, FiUser, FiBriefcase, FiTrendingUp, FiChevronDown, FiAlertCircle } from 'react-icons/fi';

const AGENTS = [
  { id: 'default', name: 'Onyx (Default)', role: 'General Assistant', provider: null, icon: FiCpu },
  { id: 'cto', name: 'AI CTO', role: 'Technology & Ops', provider: 'chatbase', chatbotId: import.meta.env.VITE_CHATBOT_ID_CTO || 'change-me-cto', icon: FiUser },
  { id: 'cfo', name: 'AI CFO', role: 'Finance & Strategy', provider: 'chatbase', chatbotId: import.meta.env.VITE_CHATBOT_ID_CFO || 'change-me-cfo', icon: FiTrendingUp },
  { id: 'manager', name: 'Manager', role: 'Product & Team', provider: 'chatbase', chatbotId: import.meta.env.VITE_CHATBOT_ID_MANAGER || 'change-me-manager', icon: FiBriefcase },
];

const isConfigured = (agent) => {
  if (!agent.chatbotId) return true;
  return !agent.chatbotId.includes('change-me');
};

const AgentSelector = ({ selectedAgentId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = AGENTS.find(a => a.id === selectedAgentId) || AGENTS[0];

  const handleSelect = (agent) => {
    if (!isConfigured(agent)) {
        toast((t) => (
            <span>
                <b>Configuration Missing</b><br/>
                {agent.name} requires a Chatbase ID. Please configure <code>VITE_CHATBOT_ID_{agent.id.toUpperCase()}</code> in your .env file.
            </span>
        ), {
            id: 'agent-config-missing',
            icon: '⚠️',
            duration: 5000,
        });
    }
    onSelect(agent);
    setIsOpen(false);
  };

  return (
    <div className="relative mb-4 z-10">
      <div className="flex items-center space-x-3">
        <span className="text-slate-400 text-sm font-medium">Active Persona:</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 bg-onyx-950/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg border border-onyx-accent/20 hover:border-purple-500 hover:bg-onyx-accent/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <selected.icon className="w-4 h-4 text-purple-400" />
          <span className="font-medium">{selected.name}</span>
          <FiChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-[110px] mt-2 w-64 bg-onyx-950 border border-onyx-accent/20 rounded-lg shadow-xl overflow-hidden z-20 animate-fadeIn">
            <div className="py-1">
              {AGENTS.map(agent => {
                const configured = isConfigured(agent);
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelect(agent)}
                    // Removing disabled attribute to allow clicking and showing the toast message
                    // disabled={!configured}
                    className={`w-full text-left px-4 py-3 flex items-center space-x-3 transition-colors border-l-2 ${
                      selectedAgentId === agent.id
                        ? 'bg-onyx-950/50 border-purple-500'
                        : 'border-transparent hover:bg-onyx-accent/10'
                    } ${!configured ? 'opacity-75' : ''}`}
                    title={!configured ? 'Agent not configured (missing ID)' : ''}
                  >
                    <div className={`p-2 rounded-md ${selectedAgentId === agent.id ? 'bg-purple-500/20' : 'bg-onyx-950'}`}>
                      <agent.icon className={`w-4 h-4 ${selectedAgentId === agent.id ? 'text-purple-400' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className={`text-sm font-medium ${selectedAgentId === agent.id ? 'text-white' : 'text-slate-300'}`}>
                          {agent.name} {!configured && <span className="text-xs text-yellow-500 ml-1">(Setup Required)</span>}
                        </div>
                        {!configured && <FiAlertCircle className="text-yellow-500 w-4 h-4" title="Missing API Configuration" />}
                      </div>
                      <div className="text-slate-500 text-xs">{agent.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentSelector;
export { AGENTS };
