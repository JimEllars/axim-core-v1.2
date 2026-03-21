// src/components/commandhub/CommandSuggestions.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CommandSuggestions = ({ suggestions, onSelect, selectedIndex }) => {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto"
      >
        <ul>
          {suggestions.map((cmd, index) => (
            <li
              key={cmd.name}
              className={`px-4 py-2 cursor-pointer ${
                index === selectedIndex ? 'bg-gray-700' : 'hover:bg-gray-700/50'
              }`}
              onMouseDown={() => onSelect(cmd.name)}
            >
              <div className="flex justify-between">
                <span className="font-semibold text-white">{cmd.name}</span>
                <span className="text-sm text-gray-400">{cmd.category}</span>
              </div>
              <p className="text-sm text-gray-400">{cmd.description}</p>
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
};

export default CommandSuggestions;
