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
import { julesApi } from '../services/jules/julesApi';
import { useDashboard } from '../contexts/DashboardContext';
import { motion } from 'framer-motion';

const CommandHub = () => {
  const [state, dispatch] = useCommandHubState();
  const { messages, inputValue, systemStats, recentCommands } = state;
  const { handleCommand, init } = useCommandHandler(dispatch);
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { supabase } = useSupabase();
  const { setActiveJulesSessionId, activeJulesSessionId } = useDashboard();

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

    if (command.trim().startsWith('/jules ')) {
      const prompt = command.trim().substring(7).trim();
      dispatch({ type: 'SET_INPUT_VALUE', payload: '' });

      const addAssistantMessage = (content) => {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content,
            type: 'assistant',
            agentName: 'Jules'
          }
        });
      };

      const addUserMessage = (content) => {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content,
            type: 'user'
          }
        });
      };

      addUserMessage(command.trim());

      if (prompt === 'list') {
        try {
          const sessions = await julesApi.listSessions();
          let listStr = "Active Jules Sessions:\n";
          sessions.forEach(s => {
             listStr += `- ${s.name.split('/').pop().substring(0, 8)}... - ${s.title || 'Untitled'}\n`;
          });
          toast.success("Fetched Jules Sessions");
          addAssistantMessage(listStr);
        } catch(e) {
          toast.error("Failed to list sessions");
          addAssistantMessage("Failed to list Jules sessions.");
        }
        return;
      }

      if (prompt === 'status') {
         if (!activeJulesSessionId) {
            toast.error("No active Jules session to check status");
            addAssistantMessage("No active Jules session to check status.");
            return;
         }
         try {
            const sess = await julesApi.getSession(activeJulesSessionId);
            const prLink = sess.outputs?.pullRequest ? `\nPR Link: ${sess.outputs.pullRequest}` : '';
            toast.success(`Session Status: ${sess.state}`);
            addAssistantMessage(`Session Status: ${sess.state}\nTitle: ${sess.title || 'Untitled'}${prLink}`);
         } catch(e) {
            toast.error("Failed to get session status");
            addAssistantMessage("Failed to get session status.");
         }
         return;
      }

      if (prompt === 'approve') {
         if (!activeJulesSessionId) {
            toast.error("No active Jules session to approve");
            addAssistantMessage("No active Jules session to approve.");
            return;
         }
         try {
            const success = await julesApi.approvePlan(activeJulesSessionId);
            if (success) {
               toast.success("Jules Plan Approved");
               addAssistantMessage("Jules Plan Approved successfully.");
            } else {
               toast.error("Failed to approve Jules plan");
               addAssistantMessage("Failed to approve Jules plan.");
            }
         } catch (e) {
            toast.error("Failed to approve Jules plan");
            addAssistantMessage("Failed to approve Jules plan.");
         }
         return;
      }

      try {
        const response = await julesApi.createSession(prompt, 'wave94-jules-api-foundation');
        const sessionId = response?.data?.id || response?.id;
        console.log("Jules Session Started:", sessionId);
        toast.success("Jules session initialized");
        setActiveJulesSessionId(sessionId);
        addAssistantMessage(`Jules session initialized. Session ID: ${sessionId}`);
      } catch (err) {
        toast.error("Failed to initialize Jules session");
        addAssistantMessage("Failed to initialize Jules session.");
      }
      return;
    }

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
    <div className="min-h-[calc(100vh-80px)] bg-onyx-950 p-6 sm:p-8 w-full flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[1600px] flex flex-col gap-6"
      >
        <CommandHubHeader />

        <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-12 gap-6 xl:gap-8 flex-grow">
          <div className="lg:col-span-3 xl:col-span-9 flex flex-col gap-4">
            <AgentSelector
              selectedAgentId={selectedAgent.id}
              onSelect={setSelectedAgent}
            />
            <div className="flex-grow flex flex-col min-h-[60vh]">
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
          </div>

          <div className="space-y-6 lg:col-span-1 xl:col-span-3">
            <SystemStatus stats={systemStats} />
            <ManualOperations onCommand={handleFormSubmit} />
            <WorkflowTriggers onSetInput={(value) => dispatch({ type: 'SET_INPUT_VALUE', payload: value })} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CommandHub;
