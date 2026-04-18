import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import IntelligenceHub from '../admin/IntelligenceHub';

const IntelligenceSearchModal = ({ isOpen, onClose }) => {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 flex items-start justify-center z-50 pt-24 px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl pointer-events-auto"
            >
              <div className="bg-onyx-900 border border-onyx-accent/30 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header / Close button */}
                <div className="flex justify-end p-2 bg-onyx-950 border-b border-onyx-accent/20">
                  <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Search Content */}
                <div className="overflow-y-auto p-4 custom-scrollbar">
                  <IntelligenceHub />
                </div>

                <div className="p-3 bg-onyx-950 border-t border-onyx-accent/20 text-xs text-slate-500 text-center flex justify-between px-6">
                    <span>Press <kbd className="px-1.5 py-0.5 bg-onyx-800 rounded border border-onyx-700">Esc</kbd> to close</span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default IntelligenceSearchModal;
