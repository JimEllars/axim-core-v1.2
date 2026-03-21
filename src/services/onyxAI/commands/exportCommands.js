// src/services/onyxAI/commands/exportCommands.js
import { createCommand } from './commandFactory';
import api from '../api';
import Papa from 'papaparse';
import { CommandValidationError, CommandExecutionError } from '../errors';

const exportCommand = createCommand({
  name: 'export',
  description: 'Exports various data types to a file.',
  category: 'System',
  keywords: ['export', 'download', 'save'],
  usage: 'export <type> as <format>',
  entities: [
    { name: 'TYPE', required: true, prompt: 'Please specify what to export (e.g., chatlog, contacts).' },
    { name: 'FORMAT', required: true, prompt: 'Please specify the format (e.g., json, csv).' }
  ],

  // Custom parser to handle "export contacts as csv" syntax
  parse: (command, extractedEntities) => {
    // Check for "export to drive" or "run backup"
    if (command.match(/export\s+to\s+drive/i) || command.match(/run\s+backup/i)) {
        return { TYPE: 'drive', FORMAT: 'none' };
    }

    const typeMatch = command.match(/export\s+([a-zA-Z]+)/i);
    const formatMatch = command.match(/as\s+(json|csv)/i);
    return {
      TYPE: typeMatch ? typeMatch[1] : extractedEntities.TYPE,
      FORMAT: formatMatch ? formatMatch[1] : extractedEntities.FORMAT,
    };
  },

  async execute({ TYPE, FORMAT }, { aximCore, userId }) {
    if (!aximCore || !userId) {
      throw new CommandExecutionError('AximCore service is not available or user is not initialized.');
    }

    const type = TYPE.toLowerCase();

    // Special case for "drive" export (manual trigger of cloud backup)
    if (type === 'drive' || type === 'backup') {
        const result = await api.triggerDataExport();
        return {
            type: 'success',
            message: `**Cloud Backup Triggered**\n\n${result.message || 'The daily export process has been started manually.'}\n\n*File:* ${result.fileName || 'N/A'}`
        };
    }

    const format = FORMAT ? FORMAT.toLowerCase() : null;

    if (format && format !== 'json' && format !== 'csv') {
      throw new CommandValidationError(`Unsupported format "${format}". Please use "json" or "csv".`);
    }

    let data;
    let content;
    let filename;
    const timestamp = new Date().toISOString().replace(/:/g, '-');

    switch (type) {
      case 'chatlog':
        data = await api.getChatHistoryForUser(userId, aximCore.conversationId);
        if (!data || data.length === 0) {
          return 'No chat history available to export.';
        }

        if (format === 'csv') {
          // The response field can be a JSON object, so we stringify it for CSV clarity.
          const csvData = data.map(item => ({
            ...item,
            response: typeof item.response === 'object' ? JSON.stringify(item.response) : item.response,
          }));
          content = Papa.unparse(csvData);
          filename = `axim-chatlog-${timestamp}.csv`;
        } else {
          content = JSON.stringify(data, null, 2);
          filename = `axim-chatlog-${timestamp}.json`;
        }
        break;

      case 'contacts':
        data = await api.listAllContacts({}, userId);
        if (!data || data.length === 0) {
          return 'No contacts available to export.';
        }
        if (format === 'csv') {
          content = Papa.unparse(data);
          filename = `axim-contacts-${timestamp}.csv`;
        } else {
          content = JSON.stringify(data, null, 2);
          filename = `axim-contacts-${timestamp}.json`;
        }
        break;

      default:
        throw new CommandValidationError(`Unknown export type "${type}". Supported types are "chatlog" and "contacts".`);
    }

    // Return a special object that the UI layer will intercept to trigger a download
    return {
      type: 'file_download',
      filename,
      content,
    };
  },
});

export default [exportCommand];
