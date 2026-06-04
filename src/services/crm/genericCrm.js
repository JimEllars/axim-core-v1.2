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
    const response = await fetch(`${this.apiUrl}/users`);
    if (!response.ok) {
      throw new Error(`Failed to fetch contacts from ${this.integration.name}.`);
    }
    const crmData = await response.json();

    // Map the data to our contact format

    const crmContacts = crmData.map(user => {

      // Implement a strict geographic bounding check on the parsed facility_zip variable.
      if (user.facility_zip) {
        const zip = parseInt(user.facility_zip, 10);
        const isWithinRange = (zip >= 75601 && zip <= 75695) || [75654, 75667, 75633].includes(zip);

        if (!isWithinRange) {
           user.lead_status = 'Out_of_Bounds_Assignment';
        }
      }

      return {
        name: user.name,
        email: user.email,
        facility_zip: user.facility_zip,
        lead_status: user.lead_status,
        axim_lead_score: user.axim_lead_score != null ? Number(user.axim_lead_score) : null
      };
    }).filter(user => {
      if (user.lead_status === 'Out_of_Bounds_Assignment') {
        console.warn(`Lead ${user.email} marked as Out_of_Bounds_Assignment and will be dropped.`);
        return false;
      }
      return true;
    });


    let addedCount = 0;
    try {
      const contactsToImport = crmContacts.map(contact => ({
        name: contact.name,
        email: contact.email,
        source: this.integration.name,
        axim_lead_score: contact.axim_lead_score // Explicit mapping for Deskera custom fields via Albato
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
