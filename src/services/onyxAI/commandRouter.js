import commands from './commands';
import { CommandNotFoundError } from './errors';

export const findCommand = (command) => {
  const lowerCaseCommand = command.toLowerCase().trim();
  const commandKeyword = lowerCaseCommand.split(' ')[0];

  const foundCommand = commands.find(c =>
    (c.keywords && c.keywords.includes(commandKeyword)) ||
    (c.aliases && c.aliases.includes(commandKeyword))
  );

  if (foundCommand) {
    // Return a copy to avoid mutation
    return { ...foundCommand };
  }

  // If no specific command is found, check for a default command.
  const defaultCommand = commands.find(c => c.isDefault);
  if (defaultCommand) {
    return { ...defaultCommand };
  }

  throw new CommandNotFoundError(`Command "${commandKeyword}" not found.`);
};
