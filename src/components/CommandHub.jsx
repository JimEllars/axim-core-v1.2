import React, { useRef, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSupabase } from '../contexts/SupabaseContext';
import { useCommandHubState } from '../hooks/useCommandHubState';
import { useCommandHandler } from '../hooks/useCommandHandler';
import { useSystemStats } from '../hooks/useSystemStats';
import CommandHubHeader from './commandhub/CommandHubHeader';
import ChatInterface from './commandhub/ChatInterface';
import InputForm from './commandhub/InputForm';
import SystemStatus from './command/SystemStatus';
import ManualOperations from './command/ManualOperations';
import WorkflowTriggers from './command/WorkflowTriggers';
import AgentSelector, { AGENTS } from './commandhub/AgentSelector';

const CommandHub = () => {
  const [state, dispatch] = useCommandHubState();
  const { messages, inputValue, systemStats, recentCommands } = state;
  const { handleCommand, init } = useCommandHandler(dispatch);
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { supabase } = useSupabase();

  useSystemStats(supabase, dispatch);

  useEffect(() => {
    init();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isProcessing = messages.length > 0 && messages[messages.length - 1].isTyping;

  const handleFormSubmit = async (command) => {
    if (!command.trim() || isProcessing) return;

    dispatch({ type: 'SET_INPUT_VALUE', payload: '' });

    // Prepare options based on selected agent (Persona)
    const options = {
      agentName: selectedAgent.name,
    };
    if (selectedAgent.provider) {
      options.provider = selectedAgent.provider;
      if (selectedAgent.chatbotId) {
        options.chatbotId = selectedAgent.chatbotId;
      }
    }

    await handleCommand(command, options);
    inputRef.current?.focus();
  };

  const handleCopyContent = (content) => {
    navigator.clipboard.writeText(content);
    toast.success('Content copied to clipboard.');
  };

  const handleClearChat = () => {
    handleCommand('clear');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <CommandHubHeader />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <AgentSelector
              selectedAgentId={selectedAgent.id}
              onSelect={setSelectedAgent}
            />
            <ChatInterface
              state={{ messages, agentName: selectedAgent?.name }}
              handlers={{ onCopyContent: handleCopyContent, onClearChat: handleClearChat }}
              messagesEndRef={messagesEndRef}
            />
            <InputForm
              inputValue={inputValue}
              isProcessing={isProcessing}
              onInputValueChange={(e) => dispatch({ type: 'SET_INPUT_VALUE', payload: e.target.value })}
              onCommand={handleFormSubmit}
              inputRef={inputRef}
              recentCommands={recentCommands}
            />
          </div>

          <div className="space-y-6">
            <SystemStatus stats={systemStats} />
            <ManualOperations onCommand={handleFormSubmit} />
            <WorkflowTriggers onSetInput={(value) => dispatch({ type: 'SET_INPUT_VALUE', payload: value })} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandHub;
