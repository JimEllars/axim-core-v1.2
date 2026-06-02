
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
    const crmContacts = crmData.map(user => ({
      name: user.name,
      email: user.email,
      axim_lead_score: user.axim_lead_score || null // Ensure the score is mapped and synced
    }));

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

  async syncUnstructuredLead(leadPayload) {
    if (!leadPayload || !leadPayload.lead_data) {
        throw new Error("Invalid lead payload structure");
    }

    // Check if the lead was flagged as out of bounds by the ingestion scraper
    if (leadPayload.status === 'Out_of_Bounds_Assignment') {
        console.warn(`Lead ${leadPayload.lead_data.email} is outside of valid territory bounds. Skipping CRM sync to prevent pipeline clutter.`);
        return {
            synced: 0,
            added: 0,
            message: "Lead skipped due to out-of-bounds assignment."
        };
    }

    // Map to generic CRM structure
    const contactToImport = {
        name: leadPayload.lead_data.contact_name || leadPayload.lead_data.company_name || 'Unknown Contact',
        email: leadPayload.lead_data.email,
        phone: leadPayload.lead_data.phone,
        source: 'Google Spark Failover',
        estimated_monthly_utility_spend: leadPayload.lead_data.estimated_monthly_utility_spend,
        facility_zip: leadPayload.lead_data.facility_zip
    };

    try {
        const sanitizedContact = sanitizePayload(contactToImport);
        await api.supabaseApiService.supabase.from('api_usage_logs').insert({
            endpoint: '/crm/genericCrm/syncUnstructuredLead',
            payload_scrubbed: sanitizedContact
        });

        await api.bulkAddContacts([contactToImport], undefined);
        return {
            synced: 1,
            added: 1,
            message: `Successfully synced unstructured lead ${contactToImport.email}`
        };
    } catch (error) {
        console.error("Failed to sync unstructured lead:", error);
        throw error;
    }
  }
}

export default GenericCrm;
