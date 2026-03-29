import { createCommand } from './commandFactory';
import logger from '../../logging';
import { CommandExecutionError } from '../errors';

export default [
  createCommand({
    name: 'scheduleMeeting',
    description: 'Schedules a meeting on your calendar.',
    keywords: ['schedule meeting', 'book meeting', 'create event', 'add to calendar'],
    category: 'Calendar',
    usage: 'schedule meeting with <person> on <date> at <time>',
    entities: [
      { name: 'person', required: true, prompt: 'Who is the meeting with?' },
      { name: 'date', required: true, prompt: 'What date should I schedule it for?' },
      { name: 'time', required: true, prompt: 'What time should the meeting start?' }
    ],
    parse: (input) => {
      const match = input.match(/(?:schedule|book) (?:a )?meeting (?:with )?(.+?) (?:on )?(.+?) (?:at )?(.+)/i);
      if (match) {
        return { person: match[1].trim(), date: match[2].trim(), time: match[3].trim() };
      }
      return {};
    },
    execute: async ({ person, date, time }, { aximCore, userId }) => {
      if (!userId) {
        throw new CommandExecutionError('Cannot schedule meeting: User ID not found in context.');
      }
      try {
        const eventData = { title: `Meeting with ${person}`, date, time, status: 'scheduled' };

        // Use the generic invokeAximService to call the external calendar integration
        await aximCore.api.invokeAximService('calendar-integration', 'schedule', eventData, userId);

        // Log the scheduling event to DB for tracking
        await aximCore.api.logEvent('calendar_event_created', eventData, userId);

        return {
          type: 'text',
          message: `Got it. I've scheduled a meeting with **${person}** on **${date}** at **${time}**.`,
          payload: eventData
        };
      } catch (error) {
        logger.error('Error scheduling meeting:', error);
        throw new CommandExecutionError(`Failed to schedule meeting: ${error.message}`);
      }
    }
  })
];