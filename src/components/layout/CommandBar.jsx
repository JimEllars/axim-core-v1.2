import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const { FiTerminal, FiChevronUp, FiChevronDown, FiSend, FiBell } = FiIcons;

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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Navigate to Command Hub and pass the command via state
    navigate('/command-hub', { state: { initialCommand: inputValue } });
    setInputValue('');
    setIsExpanded(false);
  };

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchPendingTasks = async () => {
      if (!supabase) return;
      const { count, error } = await supabase
        .from('tasks_ax2024')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error && count !== null) {
        setPendingCount(count);
      }
    };

    fetchPendingTasks();

    if (supabase) {
      const tasksSub = supabase
        .channel('public:tasks_ax2024')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks_ax2024' }, () => {
          fetchPendingTasks();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(tasksSub);
      };
    }
  }, []);

  const barVariants = {
    collapsed: { height: '48px', transition: { duration: 0.3 } },
    expanded: { height: '120px', transition: { duration: 0.3 } }
  };

  return (
    <motion.div
      initial="collapsed"
      animate={isExpanded ? 'expanded' : 'collapsed'}
      variants={barVariants}
      className="bg-onyx-950/90 backdrop-blur-md border-t border-onyx-accent/30 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] flex flex-col justify-end relative"
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

          <div className="flex items-center space-x-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg p-1 focus-within:border-onyx-accent/50 focus-within:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all">
            <div className="relative flex items-center justify-center p-2 text-onyx-accent hover:bg-onyx-accent/10 rounded-md transition-colors cursor-pointer" onClick={() => navigate('/command-hub')}>
              <SafeIcon icon={FiBell} />
              {pendingCount > 0 && (
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
              {inputValue.trim() && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="submit"
                  className="p-2 bg-onyx-accent/20 text-onyx-accent hover:bg-onyx-accent hover:text-onyx-950 rounded-md transition-colors shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                >
                  <SafeIcon icon={FiSend} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default CommandBar;