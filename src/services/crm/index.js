import GenericCrm from './genericCrm';
import SalesforceCrm from './salesforceCrm';
import SuitedashCrm from './suitedashCrm';

// In the future, you could import other CRM services here
// import HubspotCrm from './hubspotCrm';

export const getCrmService = (integration) => {
  const provider = integration.credentials?.provider;

  switch (provider) {
    case 'salesforce':
      return new SalesforceCrm(integration);
    case 'suitedash':
      return new SuitedashCrm(integration);
    case 'hubspot':
      // return new HubspotCrm(integration);
      throw new Error('HubSpot CRM integration is not yet supported.');
    case 'generic':
    default:
      return new GenericCrm(integration);
  }
};