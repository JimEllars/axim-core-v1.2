import { createCommand } from './commandFactory';

const integrationCommands = [
  createCommand({
    name: 'syncContacts',
    requires_approval: true,
    description: 'Syncs current contacts with an external CRM integration.',
    keywords: ['sync contacts', 'crm sync', 'push to crm'],
    usage: 'sync contacts',
    category: 'Integrations',
    async execute(args, context) {
      if (!context || !context.aximCore || !context.aximCore.api) {
        throw new Error('API service is not initialized.');
      }

      const userId = context.userId;
      try {
        const contacts = await context.aximCore.api.listAllContacts(userId);
        if (!contacts || contacts.length === 0) {
          return "No contacts found to sync.";
        }

        // This simulates pushing data to an external CRM.
        // Real implementation would invoke a configured integration's specific API wrapper
        const result = await context.aximCore.api.invokeAximService('crm-integration', 'bulk-upsert', { contacts }, userId);
        return `Successfully synced ${contacts.length} contacts to CRM. Job ID: ${result.jobId || 'N/A'}`;
      } catch (error) {
        return `Failed to sync contacts: ${error.message}`;
      }
    }
  }),
  createCommand({
    name: 'scheduleMeeting',
    requires_approval: true,
    description: 'Schedules a meeting via Calendar integration.',
    keywords: ['schedule meeting', 'book meeting', 'calendar meeting'],
    usage: 'schedule meeting with <person>',
    category: 'Integrations',
    entities: [
      { name: 'person', description: 'The person to meet with', required: true }
    ],
    async execute(args, context) {
      if (!context || !context.aximCore || !context.aximCore.api) {
        throw new Error('API service is not initialized.');
      }

      try {
        const result = await context.aximCore.api.invokeAximService('calendar-integration', 'schedule', { person: args.person }, context.userId);
        return `Meeting scheduled with ${args.person}. Event ID: ${result.eventId || 'N/A'}`;
      } catch (error) {
         return `Failed to schedule meeting: ${error.message}`;
      }
    }
  })
,
  createCommand({
    name: 'verifyRoundupsConnection',
    requires_approval: false,
    description: 'Verifies the connection pipeline to the Roundups API.',
    keywords: ['verify roundups', 'check roundups connection', 'test roundups api'],
    usage: 'verify roundups',
    category: 'Integrations',
    async execute(args, context) {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/roundups-connector`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ action: 'test_connection' })
        });

        if (!response.ok) {
           const errorData = await response.json().catch(() => ({}));
           throw new Error(`Request failed with status ${response.status}: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        if (data.status === 'connected') {
           return "The Roundups API pipeline is secure and the API key is active.";
        } else {
           return `Connection test failed: ${JSON.stringify(data)}`;
        }
      } catch (error) {
        return `Failed to verify Roundups connection: ${error.message}`;
      }
    }
  })
];

export default integrationCommands;