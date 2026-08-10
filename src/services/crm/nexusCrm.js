import { supabase } from '../supabaseClient';

class NexusCrm {
  constructor(integration) {
    this.integration = integration;
  }

  async pushLead(leadData) {
    console.log('Pushing lead to Nexus CRM...', leadData);
    try {
      const { data, error } = await supabase
        .from('nexus_leads')
        .insert([leadData])
        .select();

      if (error) {
        console.error('Error inserting into nexus_leads:', error);
        return { success: false, error };
      }
      return {
        success: true,
        message: 'Lead pushed to Nexus CRM successfully',
        data: data[0]
      };
    } catch (err) {
      console.error('Exception pushing lead to Nexus CRM:', err);
      return { success: false, error: err };
    }
  }
}

export default NexusCrm;
