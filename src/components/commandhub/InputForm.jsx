// src/components/commandhub/InputForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FiSend } from 'react-icons/fi';
import CommandSuggestions from './CommandSuggestions';
import onyxAI from '../../services/onyxAI';

const placeholderTexts = [
  "Type a command (e.g., 'help') or ask a question...",
  "Try 'list contacts where source is web'",
  "Try 'get system report'",
  "Try 'transcribe <url_to_audio_file>'",
];

const InputForm = ({
  inputValue,
  isProcessing,
  onInputValueChange,
  onCommand,
  inputRef, // Restored prop
  recentCommands, // Restored prop
}) => {
  const [placeholder, setPlaceholder] = useState(placeholderTexts[0]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const allCommands = useRef([]);

  useEffect(() => {
    allCommands.current = onyxAI.getCommands();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholder(prev => {
        const currentIndex = placeholderTexts.indexOf(prev);
        const nextIndex = (currentIndex + 1) % placeholderTexts.length;
        return placeholderTexts[nextIndex];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    onInputValueChange(e);

    if (value.length > 0) {
      const filtered = allCommands.current.filter(cmd =>
        cmd.name.toLowerCase().startsWith(value.toLowerCase()) ||
        cmd.keywords.some(k => k.toLowerCase().startsWith(value.toLowerCase()))
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (commandName) => {
    const syntheticEvent = { target: { value: commandName } };
    onInputValueChange(syntheticEvent);
    setShowSuggestions(false);
  };

  const handleRecentCommandClick = (command) => {
    const syntheticEvent = { target: { value: command } };
    onInputValueChange(syntheticEvent);
    inputRef.current?.focus();
  }

  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex !== -1) {
          handleSelectSuggestion(suggestions[selectedIndex].name);
        } else {
          handleSubmit(e);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowSuggestions(false);
    onCommand(inputValue);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        <CommandSuggestions
          suggestions={showSuggestions ? suggestions : []}
          onSelect={handleSelectSuggestion}
          selectedIndex={selectedIndex}
        />
        <div className="flex items-center bg-gray-900/50 backdrop-blur-md border border-gray-700 rounded-lg p-2">
          <input
            ref={inputRef} // Restored ref
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-grow bg-transparent text-white placeholder-gray-500 focus:outline-none px-2"
            disabled={isProcessing}
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label="Send command"
            className="bg-purple-600 text-white rounded-md px-4 py-2 hover:bg-purple-700 disabled:bg-gray-600 flex items-center transition-colors"
            disabled={isProcessing || !inputValue}
          >
            <FiSend className="mr-2" /> Send
          </button>
        </div>
      </div>
       {/* Restored Recent Commands UI */}
       {recentCommands && recentCommands.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs text-gray-400 self-center">Recent:</span>
          {recentCommands.map((command, index) => (
            <button
              key={`${command}-${index}`}
              type="button"
              onClick={() => handleRecentCommandClick(command)}
              className="text-xs bg-gray-700/50 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded-md"
            >
              {command}
            </button>
          ))}
        </div>
      )}
    </form>
  );
};

export default InputForm;
