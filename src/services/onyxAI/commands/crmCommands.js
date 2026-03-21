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
        // Stub implementation for CRM integration
        const dealData = { dealName, amount, company, stage: 'New', source: 'OnyxAI' };

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
];