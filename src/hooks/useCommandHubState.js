import { useReducer, useEffect } from 'react';

const initialState = {
  messages: [],
  inputValue: '',
  systemStats: {},
  recentCommands: [],
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'ADD_OR_UPDATE_MESSAGE':
      const existingMessageIndex = state.messages.findIndex(m => m.id === action.payload.id);
      if (existingMessageIndex > -1) {
        const newMessages = [...state.messages];
        newMessages[existingMessageIndex] = action.payload;
        return { ...state, messages: newMessages };
      }
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_INPUT_VALUE':
      return { ...state, inputValue: action.payload };
    case 'CLEAR_MESSAGES':
      return { ...state, messages: initialState.messages };
    case 'SET_SYSTEM_STATS':
      return { ...state, systemStats: action.payload };
    case 'ADD_RECENT_COMMAND':
      return {
        ...state,
        recentCommands: [action.payload, ...state.recentCommands.filter(c => c !== action.payload)].slice(0, 5),
      };
    default:
      return state;
  }
};

export const useCommandHubState = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load from localStorage on initial render
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatHistory');
      if (savedMessages) {
        dispatch({ type: 'SET_MESSAGES', payload: JSON.parse(savedMessages) });
      }
    } catch (error) {
      console.error('Failed to load chat history from localStorage', error);
    }
  }, []);

  // Save to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem('chatHistory', JSON.stringify(state.messages));
    } catch (error) {
      console.error('Failed to save chat history to localStorage', error);
    }
  }, [state.messages]);

  return [state, dispatch];
};