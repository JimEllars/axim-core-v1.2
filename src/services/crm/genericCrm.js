import api from '../onyxAI/api';

class GenericCrm {
  constructor(integration) {
    this.integration = integration;
    this.apiUrl = this.integration.base_url || 'https://jsonplaceholder.typicode.com';
  }

  async syncContacts() {
    // In a real-world scenario, this would make an API call to the CRM.
    // We are using JSONPlaceholder for demonstration purposes.
    const response = await fetch(`${this.apiUrl}/users`);
    if (!response.ok) {
      throw new Error(`Failed to fetch contacts from ${this.integration.name}.`);
    }
    const crmData = await response.json();

    // Map the data to our contact format
    const crmContacts = crmData.map(user => ({
      name: user.name,
      email: user.email,
    }));

    let addedCount = 0;
    try {
      const contactsToImport = crmContacts.map(contact => ({
        name: contact.name,
        email: contact.email,
        source: this.integration.name
      }));
      // Note: We use undefined for userId to let the API handle the current user
      const result = await api.bulkAddContacts(contactsToImport, undefined);
      // Assuming result is an array of added contacts
      addedCount = result ? result.length : contactsToImport.length;
    } catch (error) {
      if (error.message.includes('already exist')) {
        // Fallback for duplicates, or just log
        console.warn(`Some contacts already exist during bulk sync for ${this.integration.name}.`);
      } else {
        console.error(`Failed to bulk add contacts for ${this.integration.name}:`, error);
      }
    }

    return {
      synced: crmContacts.length,
      added: addedCount,
      message: `Synced ${crmContacts.length} contacts from ${this.integration.name}. Added ${addedCount} new contacts.`,
    };
  }
}

export default GenericCrm;