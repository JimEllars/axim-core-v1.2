import { createCommand } from './commandFactory';
import logger from '../../logging';
import { CommandExecutionError } from '../errors';

export default [
  createCommand({
    name: 'crmAddDeal',
    description: 'Creates a new deal or opportunity in the CRM pipeline.',
    keywords: ['add deal', 'create opportunity', 'new deal in crm', 'log opportunity'],
    category: 'CRM',
    usage: 'add deal <deal name> for <amount> with <company>',
    entities: [
      { name: 'dealName', required: true, prompt: 'What is the name of the deal?' },
      { name: 'amount', required: true, prompt: 'What is the deal amount?' },
      { name: 'company', required: true, prompt: 'Which company is this deal for?' }
    ],
    parse: (input) => {
      const match = input.match(/add (?:a )?deal (.+?) for (.+?) with (.+)/i);
      if (match) {
        return { dealName: match[1].trim(), amount: match[2].trim(), company: match[3].trim() };
      }
      return {};
    },
    execute: async ({ dealName, amount, company }, { aximCore, userId }) => {
      if (!userId) {
        throw new CommandExecutionError('Cannot add deal: User ID not found in context.');
      }
      try {
        const dealData = { dealName, amount, company, stage: 'New', source: 'OnyxAI' };

        // Push to CRM using the generic invokeAximService
        await aximCore.api.invokeAximService('crm-integration', 'add-deal', dealData, userId);

        await aximCore.api.logEvent('crm_deal_created', dealData, userId);

        return {
          type: 'text',
          message: `Deal **${dealName}** added to the CRM pipeline for **${company}** with an estimated value of **${amount}**.`,
          payload: dealData
        };
      } catch (error) {
        logger.error('Error adding CRM deal:', error);
        throw new CommandExecutionError(`Failed to add deal: ${error.message}`);
      }
    }
  })
,

  createCommand({
    name: 'crmLookupContact',
    description: 'Looks up a contact across CRM adapters (Deskera, Nexus, SuiteDash).',
    keywords: ['lookup contact', 'find contact', 'search crm'],
    category: 'CRM',
    usage: 'lookup contact <email or name>',
    entities: [
      { name: 'query', required: true, prompt: 'Who are you looking for?' }
    ],
    parse: (input) => {
      const match = input.match(/(?:lookup|find|search)(?: contact)? (.+)/i);
      if (match) {
        return { query: match[1].trim() };
      }
      return {};
    },
    execute: async ({ query }, { aximCore, userId }) => {
      if (!userId) throw new CommandExecutionError('User ID not found in context.');
      try {
        const payload = { action: 'lookup_contact', query };
        // Route to universal-dispatcher or dedicated crm edge function
        // The universal dispatcher can handle multi-adapter lookup if configured
        const res = await aximCore.api.invokeAximService('crm-reconciliation', 'lookup', payload, userId);

        return {
          type: 'text',
          message: `CRM Lookup results for **${query}**:\n\n${JSON.stringify(res, null, 2)}`
        };
      } catch (error) {
        logger.error('Error looking up contact:', error);
        throw new CommandExecutionError(`Failed to lookup contact: ${error.message}`);
      }
    }
  }),
  createCommand({
    name: 'crmCreateLead',
    description: 'Creates a new lead across CRM adapters.',
    keywords: ['create lead', 'new lead'],
    category: 'CRM',
    usage: 'create lead <email> [name]',
    entities: [
      { name: 'email', required: true, prompt: 'What is the lead email?' },
      { name: 'name', required: false }
    ],
    parse: (input) => {
      const parts = input.split(' ');
      const emailIndex = parts.findIndex(p => p.includes('@'));
      if (emailIndex !== -1) {
          return { email: parts[emailIndex], name: parts.filter((_, i) => i !== emailIndex && i > 1).join(' ') };
      }
      return {};
    },
    execute: async ({ email, name }, { aximCore, userId }) => {
      if (!userId) throw new CommandExecutionError('User ID not found in context.');
      try {
        const payload = { action: 'create_lead', email, name };
        const res = await aximCore.api.invokeAximService('crm-reconciliation', 'create', payload, userId);

        return {
          type: 'text',
          message: `Lead created for **${email}**.\n\n${JSON.stringify(res, null, 2)}`
        };
      } catch (error) {
        logger.error('Error creating lead:', error);
        throw new CommandExecutionError(`Failed to create lead: ${error.message}`);
      }
    }
  }),

];