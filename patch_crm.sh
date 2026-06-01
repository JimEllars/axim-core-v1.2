cat << 'INNER_EOF' > src/services/crm/genericCrm.js
import api from '../onyxAI/api';
import { sanitizePayload } from '../../utils/sanitization.js';

class GenericCrm {
  constructor(integration) {
    this.integration = integration;
    this.apiUrl = this.integration.base_url || 'https://jsonplaceholder.typicode.com';
  }

  async syncContacts() {
    // In a real-world scenario, this would make an API call to the CRM.
    // We are using JSONPlaceholder for demonstration purposes.
    const response = await fetch(\`\${this.apiUrl}/users\`);
    if (!response.ok) {
      throw new Error(\`Failed to fetch contacts from \${this.integration.name}.\`);
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

      const sanitizedContacts = sanitizePayload(contactsToImport);
      await api.supabaseApiService.supabase.from('api_usage_logs').insert({
          endpoint: '/crm/genericCrm/sync',
          payload_scrubbed: sanitizedContacts
      });

      // Note: We use undefined for userId to let the API handle the current user
      const result = await api.bulkAddContacts(contactsToImport, undefined);
      // Assuming result is an array of added contacts
      addedCount = result ? result.length : contactsToImport.length;
    } catch (error) {
      if (error.message.includes('already exist')) {
        // Fallback for duplicates, or just log
        console.warn(\`Some contacts already exist during bulk sync for \${this.integration.name}.\`);
      } else {
        console.error(\`Failed to bulk add contacts for \${this.integration.name}:\`, error);
      }
    }

    return {
      synced: crmContacts.length,
      added: addedCount,
      message: \`Synced \${crmContacts.length} contacts from \${this.integration.name}. Added \${addedCount} new contacts.\`,
    };
  }
}

export default GenericCrm;
INNER_EOF
cat << 'INNER_EOF' > src/services/crm/suitedashCrm.js
import api from '../onyxAI/api';
import { sanitizePayload } from '../../utils/sanitization.js';

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
    const url = \`\${this.apiUrl}\${endpoint}\`;
    const config = {
      ...options,
      headers: this.headers,
    };

    if (options.body) {
        const sanitizedBody = sanitizePayload(JSON.parse(options.body));
        await api.supabaseApiService.supabase.from('api_usage_logs').insert({
            endpoint: \`/crm/suitedash\${endpoint}\`,
            payload_scrubbed: sanitizedBody
        });
    }

    const response = await api.invokeAximService('api-proxy', '', {
      integrationId: this.integration.id,
      endpoint: endpoint,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null,
      headers: { ...this.headers, ...options.headers, 'Idempotency-Key': \`sd_\${Date.now()}_\${Math.random().toString(36).substring(7)}\` }
    });

    if (response.error || response.status >= 400) {
      throw new Error(\`Suitedash API Error: \${response.error || response.data?.message || 'Unknown error'}\`);
    }

    return response.data;
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
    return this._request(\`/contact/\${identifier}\`, {
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
    return this._request(\`/company/\${identifier}\`, {
      method: 'PUT',
      body: JSON.stringify(companyData),
    });
  }

  async syncContacts() {
    console.log(\`Syncing contacts from Suitedash: \${this.integration.name}...\`);
    const { data: crmData } = await this.getContacts();

    if (!crmData) {
      return {
        synced: 0,
        added: 0,
        message: 'No contacts found to sync from Suitedash.',
      };
    }

    const crmContacts = crmData.map(contact => ({
      name: \`\${contact.first_name} \${contact.last_name}\`,
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
        const sanitizedContacts = sanitizePayload(contactsToImport);
        await api.supabaseApiService.supabase.from('api_usage_logs').insert({
            endpoint: '/crm/suitedash/sync',
            payload_scrubbed: sanitizedContacts
        });

        const result = await api.bulkAddContacts(contactsToImport, undefined);
        addedCount = result ? result.length : contactsToImport.length;
      }
    } catch (error) {
      if (error.message.includes('already exist')) {
        console.warn(\`Some contacts already exist during bulk sync for \${this.integration.name}.\`);
      } else {
        console.error(\`Failed to bulk add Suitedash contacts for \${this.integration.name}:\`, error);
      }
    }

    return {
      synced: crmContacts.length,
      added: addedCount,
      message: \`Synced \${crmContacts.length} contacts from \${this.integration.name}. Added \${addedCount} new contacts.\`,
    };
  }
}

export default SuitedashCrm;
INNER_EOF
