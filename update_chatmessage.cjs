const fs = require('fs');

let content = fs.readFileSync('src/components/command/ChatMessage.jsx', 'utf8');

const replacement = `
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
                    className={\`px-3 py-1.5 rounded text-xs font-bold transition-colors \${
                        actionState === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                        actionState === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                        'bg-onyx-ai/20 text-onyx-ai hover:bg-onyx-ai/30 border border-onyx-ai/50'
                    }\`}
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
`;

const search = `
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

    // Digital Ghost Effect for AI
    return (
      <div className="relative">
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-200 drop-shadow-[0_0_2px_rgba(168,85,247,0.5)]">
          <FormattedContent content={message.content} />
        </div>
      </div>
    );
  };
`;

content = content.replace(search.trim(), replacement.trim());
fs.writeFileSync('src/components/command/ChatMessage.jsx', content);
