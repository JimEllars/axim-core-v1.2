import React from 'react';
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

const ChatInterface = ({ messages, messagesEndRef, onCopyContent, onClearChat, agentName }) => (
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
    {messages.length > 0 && messages[messages.length - 1].isTyping && <ProcessChain />}

    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar relative z-10">
      {messages.map((msg, index) => (
        <ChatMessage key={index} message={msg} onCopyContent={onCopyContent} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  </div>
);

export default ChatInterface;
