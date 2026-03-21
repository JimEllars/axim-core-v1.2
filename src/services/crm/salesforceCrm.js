import api from '../onyxAI/api';

class SalesforceCrm {
  constructor(integration) {
    this.integration = integration;
    if (!integration.credentials?.client_id || !integration.credentials?.client_secret) {
      throw new Error('Salesforce client ID and secret are required.');
    }
  }

  async syncContacts() {
    // This is a mock implementation for Salesforce.
    // In a real-world scenario, this would involve a full OAuth2 flow
    // and API calls to the Salesforce REST API.
    console.log(`Syncing contacts from Salesforce: ${this.integration.name}...`);

    const mockSalesforceContacts = [
      { name: 'Salesforce Lead 1', email: 'lead1@salesforce-example.com' },
      { name: 'Salesforce Lead 2', email: 'lead2@salesforce-example.com' },
      { name: 'Salesforce Contact 3', email: 'contact3@salesforce-example.com' },
    ];

    let addedCount = 0;
    try {
      // Optimize by mapping contacts to the import structure and sending a single bulk request.
      const contactsToImport = mockSalesforceContacts.map(contact => ({
        name: contact.name,
        email: contact.email,
        source: this.integration.name
      }));

      const result = await api.bulkAddContacts(contactsToImport, undefined);
      addedCount = result ? result.length : contactsToImport.length;
    } catch (error) {
      if (error.message.includes('already exist')) {
        console.warn(`Some contacts already exist during bulk sync for ${this.integration.name}.`);
      } else {
        console.error(`Failed to bulk add Salesforce contacts for ${this.integration.name}:`, error);
      }
    }

    return {
      synced: mockSalesforceContacts.length,
      added: addedCount,
      message: `Synced ${mockSalesforceContacts.length} contacts from ${this.integration.name}.`,
    };
  }
}

export default SalesforceCrm;