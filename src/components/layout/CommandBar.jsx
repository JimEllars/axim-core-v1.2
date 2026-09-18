import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ApprovalQueue from './ApprovalQueue';

const { FiTerminal, FiChevronUp, FiChevronDown, FiSend, FiBell, FiCommand } = FiIcons;

const CommandBar = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsExpanded(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Navigate to Command Hub and pass the command via state
    navigate('/command-hub', { state: { initialCommand: inputValue } });
    setInputValue('');
    setIsExpanded(false);
  };

  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [pendingLogsCount, setPendingLogsCount] = useState(0);
  const [isApprovalQueueOpen, setIsApprovalQueueOpen] = useState(false);
  const [pendingLogs, setPendingLogs] = useState([]);

  useEffect(() => {
    const fetchPendingTasks = async () => {
      if (!supabase) return;
      const { count, error } = await supabase
        .from('tasks_ax2024')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error && count !== null) {
        setPendingTasksCount(count);
      }
    };

    const fetchPendingLogs = async () => {
      if (!supabase) return;
      const { data, count, error } = await supabase
        .from('hitl_audit_logs')
        .select('*', { count: 'exact' })
        .eq('status', 'pending');

      if (!error) {
        setPendingLogs(data || []);
        if (count !== null) setPendingLogsCount(count);
      }
    };

    fetchPendingTasks();
    fetchPendingLogs();

    if (supabase) {
      const tasksSub = supabase
        .channel('public:tasks_ax2024')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks_ax2024' }, () => {
          fetchPendingTasks();
        })
        .subscribe();

      const logsSub = supabase
        .channel('public:hitl_audit_logs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hitl_audit_logs' }, () => {
          fetchPendingLogs();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(tasksSub);
        supabase.removeChannel(logsSub);
      };
    }
  }, []);

  const barVariants = {
    collapsed: { height: '48px', transition: { duration: 0.3, ease: 'easeInOut' } },
    expanded: { height: '120px', transition: { duration: 0.3, ease: 'easeInOut' } }
  };

  return (
    <motion.div
      initial="collapsed"
      animate={isExpanded ? 'expanded' : 'collapsed'}
      variants={barVariants}
      className="glass-effect border-t border-onyx-accent/30 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] flex flex-col justify-end relative z-50"
    >
      {/* Decorative top border glow */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-onyx-accent to-transparent opacity-50 shadow-[0_0_10px_rgba(34,211,238,1)]" />

      <div className="max-w-4xl mx-auto w-full px-4 h-full flex flex-col justify-center">
        <form onSubmit={handleSubmit} className="relative w-full">
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 w-full flex space-x-2"
              >
                <span className="text-xs text-onyx-accent/70 font-mono tracking-wider">SYSTEM_READY // AWAITING_INPUT</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center space-x-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg p-1 focus-within:border-onyx-accent/50 focus-within:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all relative">
            <div className="relative flex items-center justify-center p-2 text-onyx-accent hover:bg-onyx-accent/10 rounded-md transition-colors cursor-pointer" onClick={() => setIsApprovalQueueOpen(true)}>
              <SafeIcon icon={FiBell} />
              {pendingLogsCount > 0 && (
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-onyx-accent hover:bg-onyx-accent/10 rounded-md transition-colors focus:outline-none"
            >
              <SafeIcon icon={isExpanded ? FiChevronDown : FiChevronUp} />
            </button>
            <div className="p-2 text-onyx-ai">
              <SafeIcon icon={FiTerminal} />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter system command or query OnyxAI..."
              className="flex-1 bg-transparent border-none text-slate-200 placeholder-slate-500 focus:ring-0 font-mono text-sm py-2"
              onClick={() => !isExpanded && setIsExpanded(true)}
            />

            <AnimatePresence>
                {!isExpanded && (
                    <motion.div
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       className="absolute right-14 flex items-center text-slate-500 pointer-events-none"
                    >
                       <span className="text-[10px] font-mono tracking-widest border border-slate-700 rounded px-1.5 py-0.5 flex items-center bg-slate-900/50">
                          <SafeIcon icon={FiCommand} className="mr-1 w-2.5 h-2.5" /> K
                       </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
              {inputValue.trim() && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="submit"
                  className="p-2 bg-onyx-accent/20 text-onyx-accent hover:bg-onyx-accent hover:text-onyx-950 rounded-md transition-colors shadow-[0_0_10px_rgba(34,211,238,0.3)] z-10"
                >
                  <SafeIcon icon={FiSend} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
      <AnimatePresence>
        {isApprovalQueueOpen && (
          <ApprovalQueue
            isOpen={isApprovalQueueOpen}
            onClose={() => setIsApprovalQueueOpen(false)}
            pendingLogs={pendingLogs}
            setPendingLogs={setPendingLogs}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CommandBar;
