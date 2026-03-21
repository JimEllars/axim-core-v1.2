import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  loadProviders,
  getActiveProviderName,
  setActiveProvider,
  getAvailableProviders,
} from '../../services/onyxAI/llm';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiChevronDown, FiCpu, FiCheckCircle, FiLoader } = FiIcons;

const ProviderSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeProvider, setActiveProviderState] = useState('');
  const [availableProviders, setAvailableProviders] = useState([]);

  const updateProviderState = useCallback(() => {
    setActiveProviderState(getActiveProviderName());
    setAvailableProviders(getAvailableProviders());
  }, []);

  useEffect(() => {
    const initializeProviders = async () => {
      setIsLoading(true);
      await loadProviders();
      updateProviderState();
      setIsLoading(false);
    };
    initializeProviders();
  }, [updateProviderState]);

  const handleSelectProvider = (provider) => {
    setActiveProvider(provider);
    setActiveProviderState(provider); // Immediately update local state
    setIsOpen(false);
  };

  const getProviderDisplayName = (provider) => {
    if (!provider) return "Loading...";
    switch (provider.toLowerCase()) {
      case 'mock': return "Mock LLM";
      case 'openai': return "OpenAI";
      case 'claude': return "Claude";
      case 'gemini': return "Gemini";
      case 'deepseek': return "Deepseek";
      default: return provider;
    }
  };

  return (
    <div className="relative inline-block text-left">
      <div>
        <button
          type="button"
          className="inline-flex justify-center w-full rounded-md border border-onyx-accent/20 shadow-sm px-4 py-2 bg-onyx-950 text-sm font-medium text-slate-300 hover:bg-onyx-accent/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
        >
          {isLoading ? (
            <SafeIcon icon={FiLoader} className="mr-2 animate-spin" />
          ) : (
            <SafeIcon icon={FiCpu} className="mr-2" />
          )}
          {getProviderDisplayName(activeProvider)}
          <SafeIcon icon={FiChevronDown} className="-mr-1 ml-2 h-5 w-5" />
        </button>
      </div>

      {isOpen && !isLoading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-onyx-950 ring-1 ring-black ring-opacity-5 z-10"
        >
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            {availableProviders.map((provider) => (
              <a
                key={provider}
                href="#"
                className={`flex items-center justify-between px-4 py-2 text-sm ${
                  activeProvider === provider
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-onyx-accent/10 hover:text-white'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectProvider(provider);
                }}
                role="menuitem"
              >
                {getProviderDisplayName(provider)}
                {activeProvider === provider && <SafeIcon icon={FiCheckCircle} />}
              </a>
            ))}
             {availableProviders.length === 0 && (
              <div className="px-4 py-2 text-sm text-slate-400">
                No providers configured.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ProviderSelector;