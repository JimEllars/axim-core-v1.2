import { createCommand } from './commandFactory';
import api from '../api';
import { getCrmService } from '../../crm';
import { CommandValidationError } from '../errors';
import { parseDate } from '../utils';

const QUOTE_STRIP_REGEX = /^['"]|['"]$/g;
const FILTER_CLAUSE_REGEX = /(\w+)\s+(contains|is|equals|=|since|before|after|between)\s+('[^']+'|"[^"]+"|\S+)/gi;

const contactCommands = [
  createCommand({
    name: 'queryDatabase',
    description: 'Searches for contacts by name or email.',
    keywords: ['find', 'search', 'lookup', 'query'],
    usage: 'find <name_or_email>',
    category: 'Contact',
    entities: ['CONTACT_NAME', 'EMAIL'],
    // Custom parser needed to extract a single search term from multiple possible entities
    // or from the raw text as a fallback.
    parse: (command, extractedEntities) => {
      if (extractedEntities.CONTACT_NAME) return extractedEntities.CONTACT_NAME;
      if (extractedEntities.EMAIL) return extractedEntities.EMAIL;

      // Fallback for commands like "find Jane Doe" where NLP might miss the entity
      const keyword = ['find', 'search', 'lookup', 'query'].find(k => command.toLowerCase().startsWith(k));
      if (keyword) {
        const term = command.substring(keyword.length).trim();
        if (term) return term;
      }
      throw new CommandValidationError('Please provide a name or email to search for.');
    },
    async execute(term, { userId }) {
      const data = await api.queryDatabase(term, userId);
      if (data && data.length > 0) {
        const results = data.map(contact =>
          `• ${contact.name} (${contact.email}) - Source: ${contact.source}`
        ).join('\n');
        return `Found ${data.length} contact(s):\n${results}`;
      } else {
        return `No contacts found matching "${term}".`;
      }
    },
  }),
  createCommand({
    name: 'updateContact',
    description: 'Updates a contact\'s information.',
    keywords: ['update contact'],
    usage: 'update contact <email> set <field>=<value>, ...',
    category: 'Contact',
    entities: [{ name: 'EMAIL', required: true }],
    // Custom parser for the "set field=value" syntax.
    parse: (command, extractedEntities) => {
      const email = extractedEntities.EMAIL;
      const setClauseMatch = command.match(/set\s+(.+)/i);
      if (!setClauseMatch) {
        throw new CommandValidationError('Invalid format. Missing "set" clause. Use: update contact <email> set <field>=<value>');
      }

      const setClause = setClauseMatch[1].trim();
      const updates = {};
      const pairs = setClause.split(',').map(p => p.trim());
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=').map(p => p.trim());
        const value = valueParts.join('=');
        if (key && value) {
          updates[key] = value.replace(QUOTE_STRIP_REGEX, ''); // Remove surrounding quotes
        }
      }

      if (Object.keys(updates).length === 0) {
         throw new CommandValidationError('Invalid format. No fields to update were found.');
      }
      return { EMAIL: email, updates };
    },
    async execute({ EMAIL, updates }, { userId }) {
      await api.updateContact(EMAIL, updates, userId);
      const updatedFields = Object.keys(updates).join(', ');
      return `✅ Contact with email "${EMAIL}" has been successfully updated. Fields changed: ${updatedFields}.`;
    },
  }),
  createCommand({
    name: 'deleteContact',
    description: 'Deletes a contact by email.',
    keywords: ['delete contact', 'remove contact'],
    usage: 'delete contact <email>',
    category: 'Contact',
    entities: [{ name: 'EMAIL', required: true }],
    // Default parser is sufficient here.
    async execute({ EMAIL }, { userId }) {
      await api.deleteContact(EMAIL, userId);
      return `✅ Contact with email "${EMAIL}" has been successfully deleted.`;
    },
  }),
  createCommand({
    name: 'addContact',
    description: 'Adds a new contact.',
    keywords: ['add contact'],
    usage: 'add contact <name> <email>',
    category: 'Contact',
    entities: [
      { name: 'CONTACT_NAME', required: true, prompt: 'Please provide a name for the contact.' },
      { name: 'EMAIL', required: true, prompt: 'Please provide an email for the contact.' }
    ],
    parse: (command) => {
       // Robust parsing: Name is everything between "contact" and the last word (email)
       const emailMatch = command.match(/(\S+@\S+\.\S+)$/);
       if (!emailMatch) {
         throw new CommandValidationError('Please provide a valid email address at the end.');
       }
       const email = emailMatch[1];
       const nameMatch = command.match(/add contact\s+(.+)\s+\S+@/i);
       const name = nameMatch ? nameMatch[1].trim() : '';

       if (!name) {
          throw new CommandValidationError('Please provide a name for the contact.');
       }
       return { CONTACT_NAME: name, EMAIL: email };
    },
    async execute({ CONTACT_NAME, EMAIL }, { userId }) {
      await api.addContact(CONTACT_NAME, EMAIL, 'command_hub', userId);
      return `✅ Contact "${CONTACT_NAME}" (${EMAIL}) has been successfully added.`;
    },
  }),
  createCommand({
    name: 'syncCrm',
    description: 'Syncs contacts from a CRM.',
    keywords: ['sync crm', 'sync contacts'],
    usage: 'sync crm',
    category: 'Contact',
    entities: [],
    // No args needed, so default parser is fine.
    async execute() {
      const integrations = await api.listAPIIntegrations();
      const crmIntegration = integrations.find(i => i.type === 'crm' && i.status === 'active');
      if (!crmIntegration) {
        throw new Error('No active CRM integration found. Please configure one in the API Integration Center.');
      }
      const crmService = getCrmService(crmIntegration);
      const result = await crmService.syncContacts();
      return `✅ CRM Sync Complete: ${result.message}`;
    },
  }),
  createCommand({
    name: 'listContacts',
    description: 'Lists all contacts, with optional sorting and filtering.',
    keywords: ['list contacts', 'show all contacts', 'get all contacts', 'list'],
    usage: 'list contacts sort by <field> <asc|desc> where <field> contains <value>',
    category: 'Contact',
    entities: [],
    // A more robust parser for handling complex sorting and filtering logic.
    parse: (command) => {
      const options = {
        sortBy: 'name',
        sortOrder: 'asc',
        filters: [],
      };

      // Remove the base command part to isolate arguments
      let argsString = command.replace(/^(list contacts|show all contacts|get all contacts|list)\s*/i, '');

      // 1. Handle Sorting
      const sortByRegex = /sort by (\w+)\s*(asc|desc)?/i;
      const sortByMatch = argsString.match(sortByRegex);
      if (sortByMatch) {
        options.sortBy = sortByMatch[1].trim();
        if (sortByMatch[2]) {
          options.sortOrder = sortByMatch[2].trim().toLowerCase();
        }
        argsString = argsString.replace(sortByRegex, '').trim();
      }

      // 2. Handle Filtering
      const whereIndex = argsString.toLowerCase().indexOf('where');
      if (whereIndex > -1) {
        const filtersString = argsString.substring(whereIndex + 5).trim();
        const matches = filtersString.matchAll(FILTER_CLAUSE_REGEX);

        for (const match of matches) {
          const field = match[1].trim();
          const operator = match[2].trim().toLowerCase();
          let value = match[3].trim().replace(QUOTE_STRIP_REGEX, ''); // Strip quotes

          if (['since', 'before', 'after', 'between'].includes(operator)) {
            const parsed = parseDate(value);
            value = { startDate: parsed.startDate, endDate: parsed.endDate };
          }

          options.filters.push({
            field,
            operator,
            value,
          });
        }
      }
      return options;
    },
    async execute(options, { userId }) {
      const data = await api.listAllContacts(options, userId);
      if (data && data.length > 0) {
        const results = data.map(contact =>
          `• ${contact.name} (${contact.email}) - Source: ${contact.source}`
        ).join('\n');
        return `Found ${data.length} contact(s):\n${results}`;
      } else {
        return 'No contacts found in the database.';
      }
    },
  }),
];

// This is a simple array export, not using the factory, because it's just a list of commands.
export default contactCommands;
