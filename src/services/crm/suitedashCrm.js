import api from '../onyxAI/api';

class SuitedashCrm {
  constructor(integration) {
    this.integration = integration;
    this.apiUrl = 'https://app.suitedash.com/secure-api';

    if (!integration.credentials?.public_id || !integration.credentials?.secret_key) {
      throw new Error('Suitedash Public ID and Secret Key are required.');
    }

    this.headers = {
      'Content-Type': 'application/json',
      'X-Public-ID': integration.credentials.public_id,
      'X-Secret-Key': integration.credentials.secret_key,
    };
  }

  async _request(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    const config = {
      ...options,
      headers: this.headers,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Suitedash API Error: ${errorData.message || response.statusText}`);
    }

    return response.json();
  }

  // Contact Methods
  async getContacts() {
    return this._request('/contacts');
  }

  async createContact(contactData) {
    return this._request('/contact', {
      method: 'POST',
      body: JSON.stringify(contactData),
    });
  }

  async updateContact(identifier, contactData) {
    return this._request(`/contact/${identifier}`, {
      method: 'PUT',
      body: JSON.stringify(contactData),
    });
  }

  // Company Methods
  async getCompanies() {
    return this._request('/companies');
  }

  async createCompany(companyData) {
    return this._request('/company', {
      method: 'POST',
      body: JSON.stringify(companyData),
    });
  }

  async updateCompany(identifier, companyData) {
    return this._request(`/company/${identifier}`, {
      method: 'PUT',
      body: JSON.stringify(companyData),
    });
  }

  async syncContacts() {
    console.log(`Syncing contacts from Suitedash: ${this.integration.name}...`);
    const { data: crmData } = await this.getContacts();

    if (!crmData) {
      return {
        synced: 0,
        added: 0,
        message: 'No contacts found to sync from Suitedash.',
      };
    }

    const crmContacts = crmData.map(contact => ({
      name: `${contact.first_name} ${contact.last_name}`,
      email: contact.email,
    }));

    let addedCount = 0;
    try {
      const contactsToImport = crmContacts
        .filter(contact => contact.email)
        .map(contact => ({
          name: contact.name,
          email: contact.email,
          source: this.integration.name
        }));

      if (contactsToImport.length > 0) {
        const result = await api.bulkAddContacts(contactsToImport, undefined);
        addedCount = result ? result.length : contactsToImport.length;
      }
    } catch (error) {
      if (error.message.includes('already exist')) {
        console.warn(`Some contacts already exist during bulk sync for ${this.integration.name}.`);
      } else {
        console.error(`Failed to bulk add Suitedash contacts for ${this.integration.name}:`, error);
      }
    }

    return {
      synced: crmContacts.length,
      added: addedCount,
      message: `Synced ${crmContacts.length} contacts from ${this.integration.name}. Added ${addedCount} new contacts.`,
    };
  }
}

export default SuitedashCrm;