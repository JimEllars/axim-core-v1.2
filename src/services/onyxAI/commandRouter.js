import commands from './commands';
import { CommandNotFoundError } from './errors';
import { trackEvent } from '../telemetry';


export const findCommand = (command) => {
  const startTime = performance.now();
  const lowerCaseCommand = command.toLowerCase().trim();
  const commandKeyword = lowerCaseCommand.split(' ')[0];

  // First pass: Direct exact keyword match
  let foundCommand = commands.find(c =>
    (c.keywords && c.keywords.includes(commandKeyword)) ||
    (c.aliases && c.aliases.includes(commandKeyword))
  );

  // Second pass: Fuzzy match for multi-word triggers or natural language
  if (!foundCommand) {
    foundCommand = commands.find(c => {
      if (c.keywords) {
        return c.keywords.some(kw => lowerCaseCommand.includes(kw.toLowerCase()));
      }
      return false;
    });
  }

  const latency = Math.round(performance.now() - startTime);

  if (foundCommand) {
    trackEvent('onyx_command_router', {
       component: 'onyx_command_router',
       action: 'command_resolved',
       commandKeyword,
       resolvedId: foundCommand.id,
       latency
    });
    // Return a copy to avoid mutation
    return { ...foundCommand };
  }

  // If no specific command is found, check for a default command.
  const defaultCommand = commands.find(c => c.isDefault);
  if (defaultCommand) {
    trackEvent('onyx_command_router', {
       component: 'onyx_command_router',
       action: 'command_resolved_default',
       commandKeyword,
       resolvedId: defaultCommand.id,
       latency
    });
    return { ...defaultCommand };
  }

  trackEvent('onyx_command_router', {
     component: 'onyx_command_router',
     action: 'command_not_found',
     commandKeyword,
     latency,
     severity: 'WARN'
  });

  throw new CommandNotFoundError(`Command "${commandKeyword}" not found.`);
};


// We ensure a quick fallback to cached definitions if there's a timeout.
// But findCommand is synchronous. If it's used in an async context that times out,
// the caller must handle the timeout. We'll add a helper function here.
export const executeCommandWithTimeout = async (commandFunc, command, args, timeoutMs = 8000) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            trackEvent('onyx_command_router', {
               action: 'timeout_fallback',
               command: typeof command === 'string' ? command : command.id,
               severity: 'WARN'
            });
            // Fallback: return a cached definition or empty response to prevent agent worker queue from halting
            resolve({
                status: 'timeout_fallback',
                data: { message: "Command execution timed out. Falling back to cached state.", cached: true }
            });
        }, timeoutMs);

        commandFunc(command, args).then(res => {
            clearTimeout(timer);
            resolve(res);
        }).catch(err => {
            clearTimeout(timer);
            reject(err);
        });
    });
};
