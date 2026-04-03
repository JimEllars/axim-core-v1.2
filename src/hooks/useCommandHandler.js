import { useCallback } from 'react';
import onyxAI from '../services/onyxAI';
import api from '../services/onyxAI/api';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';

const createMessage = (content, type = 'user', props = {}) => ({
  id: uuidv4(),
  timestamp: new Date(),
  content,
  type,
  ...props,
});

const welcomeMessage = {
  id: 'welcome-message',
  type: 'assistant',
  content: "Welcome to the AXiM Core Command Hub. I'm Onyx, your AI assistant. Type 'help' to see a list of available commands.",
  timestamp: new Date(),
};

export const useCommandHandler = (dispatch) => {
  const { user } = useAuth();

  const init = useCallback(async () => {
    if (!user) {
      dispatch({ type: 'SET_MESSAGES', payload: [welcomeMessage] });
      return;
    }
    const history = await api.getChatHistoryForUser(user.id, onyxAI.conversationId);
    const messages = history
      .filter(item => item.status === 'success')
      .flatMap(item => [
        createMessage(item.command, 'user'),
        createMessage(item.response, 'assistant'),
      ]);

    if (messages.length === 0) {
      dispatch({ type: 'SET_MESSAGES', payload: [welcomeMessage] });
    } else {
      dispatch({ type: 'SET_MESSAGES', payload: messages });
    }
  }, [dispatch, user]);

  const handleCommand = useCallback(async (commandStr, options = {}) => {
    const userMessage = createMessage(commandStr, 'user');
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    dispatch({ type: 'ADD_RECENT_COMMAND', payload: commandStr });

    const assistantMessageId = uuidv4();
    const assistantTypingMessage = createMessage('...', 'assistant', { isTyping: true, id: assistantMessageId });
    dispatch({ type: 'ADD_MESSAGE', payload: assistantTypingMessage });

    try {
      const structuredResponse = await onyxAI.routeCommand(commandStr, options);

      // Extract metadata
      const { metadata = {}, payload } = structuredResponse;
      const agentName = metadata.agentName;

      // Use payload for checking special response types
      const response = payload;

      // Handle special response types first.
      if (typeof response === 'object' && response !== null) {
        if (response.type === 'file_download') {
          if (response.filename && response.content) {
            const blob = new Blob([response.content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const successMessage = createMessage(`Successfully exported chat log to ${response.filename}`, 'assistant', { id: assistantMessageId, agentName });
            dispatch({ type: 'ADD_OR_UPDATE_MESSAGE', payload: successMessage });
            return;
          } else {
              // If the file_download object is malformed, treat it as an error.
              throw new Error('Export failed: The file download data was incomplete.');
          }
        } else if (response.type === '__CLEAR_CHAT__') {
          dispatch({ type: 'CLEAR_MESSAGES' });
          toast.success('Chat history cleared and new session started.');
          return;
        }
      }

      // For all other responses, create the final message.
      const content = structuredResponse.content || response;
      const finalMessage = createMessage(content, 'assistant', { id: assistantMessageId, agentName });
      dispatch({ type: 'ADD_OR_UPDATE_MESSAGE', payload: finalMessage });
    } catch (error) {
      console.error("Command execution failed:", error);
      let errorContent;
      let toastMessage = 'An unexpected error occurred.';

      switch (error.name) {
        case 'CommandNotFoundError':
          toastMessage = `Unknown Command: "${commandStr}"`;
          errorContent = {
            title: 'Unknown Command',
            details: `The command "${commandStr}" is not recognized. Try "help" for a list of commands.`,
          };
          break;
        case 'CommandValidationError':
          toastMessage = 'Invalid command format.';
          errorContent = {
            title: 'Invalid Command Format',
            details: error.message,
          };
          break;
        case 'IntentParsingError':
          toastMessage = 'AI could not understand the command.';
          errorContent = {
            title: 'AI Interpretation Error',
            details: 'The AI could not understand your command. Please try rephrasing it.',
          };
          break;
        case 'DatabaseError':
          toastMessage = 'A database error occurred.';
          errorContent = {
            title: 'Database Operation Failed',
            details: 'Could not complete the operation due to a database error. Please check your connection or contact support.',
          };
          break;
        case 'CommandExecutionError':
          toastMessage = 'Command execution failed.';
          errorContent = {
            title: 'Command Execution Failed',
            details: error.message,
          };
          break;
        default:
          toastMessage = 'An unexpected server error occurred.';
          errorContent = {
            title: 'An Unexpected Error Occurred',
            details: error.message || 'An unknown error occurred. See console for details.',
          };
      }
      toast.error(toastMessage);
      const errorMessage = createMessage(errorContent, 'error', { id: assistantMessageId });
      dispatch({ type: 'ADD_OR_UPDATE_MESSAGE', payload: errorMessage });
    }
  }, [dispatch]);

  return { handleCommand, init };
};