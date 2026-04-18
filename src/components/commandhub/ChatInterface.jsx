import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDownload, FiTrash2, FiMessageSquare, FiActivity, FiGitCommit, FiCpu, FiCheckCircle } from 'react-icons/fi';
import ChatMessage from '../command/ChatMessage';
import SafeIcon from '../../common/SafeIcon';

const ProcessChain = () => (
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: 'auto' }}
    className="flex items-center justify-between px-4 py-2 bg-onyx-950/50 border-y border-onyx-accent/10 mb-4"
  >
    <div className="flex items-center space-x-2 text-xs text-onyx-accent/70 font-mono">
      <SafeIcon icon={FiActivity} className="animate-pulse text-onyx-ai" />
      <span>ROUTING LOGIC</span>
    </div>
    <div className="flex items-center space-x-4 text-[10px] text-slate-500 font-mono tracking-widest">
      <div className="flex items-center"><SafeIcon icon={FiGitCommit} className="mr-1 text-onyx-accent" /> INPUT</div>
      <div className="w-8 h-[1px] bg-onyx-accent/30 relative">
        <div className="absolute top-0 left-0 h-full bg-onyx-accent animate-[ping_2s_infinite]" style={{ width: '10%' }}/>
      </div>
      <div className="flex items-center"><SafeIcon icon={FiCpu} className="mr-1 text-onyx-ai" /> PROCESSING</div>
      <div className="w-8 h-[1px] bg-onyx-ai/30 relative">
        <div className="absolute top-0 left-0 h-full bg-onyx-ai animate-[ping_2s_infinite_0.5s]" style={{ width: '10%' }}/>
      </div>
      <div className="flex items-center"><SafeIcon icon={FiCheckCircle} className="mr-1 text-green-400" /> EXECUTION</div>
    </div>
  </motion.div>
);


const ChatInterface = ({ state, handlers, messagesEndRef }) => {
  const { messages, agentName } = state;
  const { onCopyContent, onClearChat } = handlers;

  const [localMessages, setLocalMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const handleUserMessage = (e) => {
      const { prompt } = e.detail;
      setLocalMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        content: prompt,
        type: 'user'
      }]);
    };

    const handleStreamError = (e) => {
      setLocalMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        content: { title: 'Stream Error', details: e.detail.error },
        type: 'error'
      }]);
      setIsStreaming(false);
    };

    const handleStreamResponse = async (e) => {
      const { body } = e.detail;
      if (!body) return;

      setIsStreaming(true);
      const reader = body.getReader();
      const decoder = new TextDecoder();
      const aiMessageId = crypto.randomUUID();

      setLocalMessages(prev => [...prev, {
        id: aiMessageId,
        timestamp: new Date(),
        content: '',
        type: 'assistant',
        agentName: 'Onyx mk3',
        isTyping: true
      }]);

      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let eolIndex;
          while ((eolIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, eolIndex).trim();
            buffer = buffer.slice(eolIndex + 1);

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  setLocalMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId
                      ? { ...msg, content: msg.content + parsed.content, isTyping: false }
                      : msg
                  ));
                }
              } catch (err) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (err) {
        console.error('SSE Read Error:', err);
      } finally {
        setIsStreaming(false);
        setLocalMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, isTyping: false }
            : msg
        ));
      }
    };

    window.addEventListener('onyx-user-message', handleUserMessage);
    window.addEventListener('onyx-stream-response', handleStreamResponse);
    window.addEventListener('onyx-stream-error', handleStreamError);

    const handleActionApproval = async (e) => {
      const { approved, toolCall } = e.detail;
      const logAction = async () => {
         try {
             const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
             const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
             let token = '';
             for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.endsWith('-auth-token')) {
                    const session = localStorage.getItem(key);
                    if (session) {
                       try {
                          token = JSON.parse(session).access_token || '';
                          break;
                       } catch (e) { /* ignore */ }
                    }
                }
             }

             // We need to parse JWT or just use Supabase client directly
             // Instead of raw fetch to REST API for hitl_audit_logs, we should import supabase client, but it's not currently imported here.
             // We can use the REST API.

             if (token) {
                 const payloadBase64Url = token.split('.')[1];
                 const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
                 const payload = JSON.parse(atob(payloadBase64));
                 const adminId = payload.sub;

                 await fetch(`${supabaseUrl}/rest/v1/hitl_audit_logs`, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${token}`,
                         'apikey': anonKey,
                         'Prefer': 'return=minimal'
                     },
                     body: JSON.stringify({
                         admin_id: adminId,
                         action: approved ? 'approve' : 'deny',
                         tool_called: toolCall?.name || 'unknown'
                     })
                 });
             }
         } catch (error) {
             console.error('Failed to log HITL action:', error);
         }
      };

      // Run log async
      logAction();

      if (approved) {
         setLocalMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content: `Executing tool call: ${toolCall.name}...`,
            type: 'user'
         }]);
         try {
             const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
             let token = '';
             for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.endsWith('-auth-token')) {
                    const session = localStorage.getItem(key);
                    if (session) {
                       try {
                          token = JSON.parse(session).access_token || '';
                          break;
                       } catch (e) { /* ignore */ }
                    }
                }
             }
             const res = await fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${token}`
                 },
                 body: JSON.stringify({
                     command: 'approve_action',
                     toolCall
                 })
             });

             if (res.ok) {
                 const data = await res.json();
                 setLocalMessages(prev => [...prev, {
                     id: crypto.randomUUID(),
                     timestamp: new Date(),
                     content: data.response || 'Action executed successfully.',
                     type: 'assistant',
                     agentName: 'Onyx mk3'
                 }]);
             } else {
                 throw new Error(await res.text());
             }
         } catch (error) {
             setLocalMessages(prev => [...prev, {
                 id: crypto.randomUUID(),
                 timestamp: new Date(),
                 content: { title: 'Execution Error', details: error.message },
                 type: 'error'
             }]);
         }
      } else {
         setLocalMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content: 'Action denied.',
            type: 'user'
         }]);
      }
    };

    window.addEventListener('onyx-user-message', handleUserMessage);
    window.addEventListener('onyx-stream-response', handleStreamResponse);
    window.addEventListener('onyx-stream-error', handleStreamError);
    window.addEventListener('onyx-action-approval', handleActionApproval);

    return () => {
      window.removeEventListener('onyx-user-message', handleUserMessage);
      window.removeEventListener('onyx-stream-response', handleStreamResponse);
      window.removeEventListener('onyx-stream-error', handleStreamError);
      window.removeEventListener('onyx-action-approval', handleActionApproval);
    };
  }, []);

  const displayMessages = [...messages, ...localMessages];


  return (
  <div className="glass-effect p-4 rounded-lg mb-4 h-[60vh] flex flex-col bg-onyx-950/80 backdrop-blur-md border border-onyx-accent/20 relative overflow-hidden">
    {/* Decorative Scanline */}
    <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(transparent_50%,rgba(34,211,238,1)_50%)] bg-[length:100%_4px]" />

    <div className="flex justify-between items-center mb-2 border-b border-onyx-accent/20 pb-2 relative z-10">
      <div className="flex items-center space-x-2">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center">
          <SafeIcon icon={FiActivity} className="mr-2 text-onyx-accent" />
          Operational Timeline
        </h2>
        {agentName && (
           <span className="flex items-center bg-onyx-ai/10 text-onyx-ai px-2 py-1 rounded text-[10px] uppercase tracking-wider border border-onyx-ai/30 shadow-[0_0_10px_rgba(168,85,247,0.2)] animate-fadeIn">
             <FiMessageSquare className="mr-1.5 w-3 h-3" />
             ACTIVE_AGENT: <strong className="ml-1 text-white">{agentName}</strong>
           </span>
        )}
      </div>
      <div>
        <button
          onClick={onClearChat}
          className="flex items-center text-slate-400 hover:text-white p-2 rounded-md transition-colors text-sm"
          aria-label="Clear Chat"
        >
          <FiTrash2 className="mr-2" />
          <span>Clear</span>
        </button>
      </div>
    </div>
    {displayMessages.length > 0 && displayMessages[displayMessages.length - 1].isTyping && <ProcessChain />}

    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar relative z-10">
      {displayMessages.map((msg, index) => (
        <ChatMessage key={index} message={msg} onCopyContent={onCopyContent} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  </div>
  );
};

export default ChatInterface;
