import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import FormattedContent from './FormattedContent';

const { FiTerminal, FiCpu, FiCopy } = FiIcons;

const ChatMessage = ({ message, onCopyContent }) => {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';

  const containerClasses = `flex w-full ${isUser ? 'justify-end' : 'justify-start'}`;
  const messageClasses = `max-w-3xl rounded-lg overflow-hidden relative ${
    isUser
      ? 'bg-onyx-accent/10 border border-onyx-accent/30 text-onyx-accent cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.1)]'
      : isError
      ? 'bg-red-900/20 border border-red-500/50 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
      : 'bg-onyx-ai/5 border border-onyx-ai/30 text-slate-200 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
  }`;

  const isFinbot = message.agentId === 'finbot';
  const isDocbot = message.agentId === 'docbot';

  const iconContainerClasses = `w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
    isUser
      ? 'bg-onyx-accent/20 border border-onyx-accent/50 text-onyx-accent shadow-[0_0_10px_rgba(34,211,238,0.3)]'
      : isError
      ? 'bg-red-500/20 border border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
      : isFinbot
      ? 'bg-green-500/20 border border-green-500/50 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
      : 'bg-onyx-ai/20 border border-onyx-ai/50 text-onyx-ai shadow-[0_0_10px_rgba(168,85,247,0.3)]'
  }`;


  let specializedAgentName = null;
  if (isFinbot) {
      specializedAgentName = 'AXiM Finance';
  } else if (isDocbot) {
      specializedAgentName = 'AXiM DocBot';
  } else if (!isUser && !isError && typeof message.content === 'string') {
    const lowerContent = message.content.toLowerCase();
    if (lowerContent.includes('billing') || lowerContent.includes('invoice')) {
        specializedAgentName = 'BILLING BOT';
    } else if (lowerContent.includes('compliance')) {
        specializedAgentName = 'COMPLIANCE BOT';
    }
  }

  const agentDisplayName = specializedAgentName || message.agentName || 'ONYX.CORE';

  const handleCopy = () => {
    let contentToCopy;
    if (isError) {
      contentToCopy = typeof message.content.details === 'string'
        ? message.content.details
        : JSON.stringify(message.content.details, null, 2);
    } else {
      contentToCopy = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content, null, 2);
    }
    onCopyContent(contentToCopy);
  };

  const renderContent = () => {
    if (message.isTyping) {
      return (
        <div className="flex items-center space-x-2 opacity-70">
          <span className="text-xs font-mono text-onyx-ai uppercase tracking-widest animate-pulse">PROCESSING</span>
          <div className="flex space-x-1">
            <div className="w-1.5 h-1.5 bg-onyx-ai rounded-full animate-bounce shadow-[0_0_5px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0s' }} />
            <div className="w-1.5 h-1.5 bg-onyx-ai rounded-full animate-bounce shadow-[0_0_5px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 bg-onyx-ai rounded-full animate-bounce shadow-[0_0_5px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      );
    }
    if (isError) {
      return (
        <>
          <strong className="font-bold text-red-400 pr-2">{message.content.title}</strong>
          <FormattedContent content={message.content.details} />
        </>
      );
    }
    if (isUser) {
      return <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-onyx-accent/90">{message.content}</div>;
    }

    let parsedContent = message.content;
    let actionPayload = null;

    if (typeof message.content === 'string') {
        try {
            const parsed = JSON.parse(message.content);
            if (parsed && typeof parsed === 'object') {
                if (parsed.action_payload) {
                    actionPayload = parsed.action_payload;
                    delete parsed.action_payload;
                }
                parsedContent = JSON.stringify(parsed, null, 2);
            }
        } catch (e) {
            // Not JSON
        }
    } else if (typeof message.content === 'object' && message.content !== null) {
        parsedContent = { ...message.content };
        if (parsedContent.action_payload) {
            actionPayload = parsedContent.action_payload;
            delete parsedContent.action_payload;
        }
    }

    const [actionState, setActionState] = React.useState('idle'); // idle, loading, error, success
    const [actionError, setActionError] = React.useState(null);

    const handleActionClick = async () => {
        setActionState('loading');
        setActionError(null);
        try {
            // Simulated backend RPC call, replace with actual call
            if (actionPayload.type === 'issue_refund' && actionPayload.target === 'fail@email.com') {
                 throw new Error("RPC Failed: Target not found");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            setActionState('success');
            setTimeout(() => setActionState('idle'), 3000);
        } catch (err) {
            setActionState('error');
            setActionError(err.message || 'Action failed');
            setTimeout(() => setActionState('idle'), 5000);
        }
    }


    // Digital Ghost Effect for AI
    return (
      <div className="relative">
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-200 drop-shadow-[0_0_2px_rgba(168,85,247,0.5)]">
          <FormattedContent content={parsedContent} />
        </div>
        {actionPayload && (
            <div className="mt-4 p-3 bg-onyx-950/50 border border-onyx-ai/30 rounded flex flex-col items-start gap-2">
                <span className="text-xs text-onyx-ai uppercase tracking-wider">Suggested Action: {actionPayload.type}</span>
                {actionPayload.target && <span className="text-xs text-slate-400">Target: {actionPayload.target}</span>}
                <button
                    onClick={handleActionClick}
                    disabled={actionState === 'loading' || actionState === 'success'}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                        actionState === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                        actionState === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                        'bg-onyx-ai/20 text-onyx-ai hover:bg-onyx-ai/30 border border-onyx-ai/50'
                    }`}
                >
                    {actionState === 'loading' ? 'Processing...' :
                     actionState === 'success' ? 'Completed' :
                     actionState === 'error' ? 'Retry Action' : 'Execute Action'}
                </button>
                {actionState === 'error' && (
                    <div className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <FiIcons.FiAlertCircle /> {actionError}
                    </div>
                )}
            </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      className={`${containerClasses} group mb-4`}
    >
      <div
        className={messageClasses}
        onClick={() => isUser && alert(`Full command:\n\n${message.content}`)}
      >
        {/* Subtle scanline for AI messages */}
        {!isUser && !isError && (
          <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(transparent_50%,rgba(168,85,247,1)_50%)] bg-[length:100%_4px] mix-blend-overlay" />
        )}

        <div className="flex items-start space-x-3 p-4 relative z-10">
          <div className={iconContainerClasses}>
            <SafeIcon
              icon={isUser ? FiTerminal : FiCpu}
              className="text-current text-sm"
            />
          </div>
          <div className="flex-1 overflow-x-hidden">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-current/10">

              <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 flex items-center">
                {isUser ? 'SYS.ADMIN' : (
                   <div className="flex items-center space-x-2">
                       <span>{agentDisplayName}</span>
                       {specializedAgentName && (
                          <span className="bg-blue-500/20 border border-blue-500/50 text-blue-300 px-1.5 py-0.5 rounded text-[8px] tracking-widest ml-2">
                             DELEGATED TASK
                          </span>
                       )}
                   </div>
                )}
                {!isUser && !isError && <span className="ml-2 w-1.5 h-1.5 bg-onyx-ai rounded-full animate-pulse shadow-[0_0_5px_rgba(168,85,247,0.8)]" />}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-xs opacity-50">
                  {message.timestamp.toLocaleTimeString()}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-onyx-accent/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title="Copy content"
                >
                  <SafeIcon icon={FiCopy} className="text-xs" />
                </button>
              </div>
            </div>
            <div className="font-mono text-sm leading-relaxed">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
