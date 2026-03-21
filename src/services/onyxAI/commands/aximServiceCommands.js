// src/services/onyxAI/commands/aximServiceCommands.js
import { createCommand } from './commandFactory';
import api from '../api';

const aximServiceCommand = createCommand({
  name: 'axim-service',
  description: 'Calls a generic AXiM service via the secure proxy.',
  keywords: ['axim', 'service', 'proxy', 'call'],
  category: 'Integrations',
  usage: 'axim-service <serviceName> <endpoint> <payloadAsJson>',
  // Custom parser to split by space but allow spaces in the JSON payload part
  parse: (input, extractedEntities) => {
     // Regex to match: axim-service <serviceName> <endpoint> <rest...>
     // Example: axim-service my-service /api/v1 {"foo": "bar"}
     const match = input.match(/^axim-service\s+([^\s]+)\s+([^\s]+)\s+(.+)$/);
     if (match) {
         return {
             serviceName: match[1],
             endpoint: match[2],
             payloadString: match[3]
         };
     }
     // Fallback if regex doesn't match (e.g., missing args), return empty object to fail validation in execute
     return {};
  },
  execute: async (args, context) => {
    const { serviceName, endpoint, payloadString } = args;

    if (!serviceName || !endpoint || !payloadString) {
      return {
        type: 'error',
        message: 'Invalid usage. Required format: axim-service <serviceName> <endpoint> <payloadAsJson>',
      };
    }

    let payload;
    try {
      payload = JSON.parse(payloadString);
    } catch (e) {
      return {
        type: 'error',
        message: `Invalid JSON payload: ${e.message}`,
      };
    }

    const { userId } = context;
    if (!userId) {
      return {
        type: 'error',
        message: 'User ID context is missing.',
      };
    }

    try {
      const response = await api.invokeAximService(serviceName, endpoint, payload, userId);
      return {
        type: 'success',
        message: `Successfully called AXiM service '${serviceName}'.`,
        data: response,
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Error calling AXiM service '${serviceName}': ${error.message}`,
      };
    }
  },
});

const listServicesCommand = createCommand({
  name: 'listServices',
  description: 'Lists all available external AXiM services and integrations.',
  keywords: ['list services', 'list integrations', 'show services', 'available services'],
  usage: 'list services',
  category: 'Integrations',
  execute: async (args, context) => {
    try {
      // Use the generic API to fetch integrations
      const integrations = await api.listAPIIntegrations();

      if (!integrations || integrations.length === 0) {
        return 'No services found. You can add new integrations in the API Integration Center.';
      }

      const formatted = integrations.map(svc =>
        `• **${svc.name}** (${svc.type})\n  Status: ${svc.status === 'active' ? '✅ Active' : '❌ Inactive'}\n  Endpoint: ${svc.endpoint_url || 'N/A'}`
      ).join('\n\n');

      return `Found ${integrations.length} available service(s):\n\n${formatted}`;
    } catch (error) {
       // Fallback mock if API not ready
       return {
         type: 'error',
         message: `Failed to list services: ${error.message}`
       };
    }
  }
});

export default [aximServiceCommand, listServicesCommand];
