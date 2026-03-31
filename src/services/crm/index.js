import GenericCrm from './genericCrm';
import SalesforceCrm from './salesforceCrm';
import SuitedashCrm from './suitedashCrm';

// In the future, you could import other CRM services here

export const getCrmService = (integration) => {
  const provider = integration.credentials?.provider;

  switch (provider) {
    case 'salesforce':
      return new SalesforceCrm(integration);
    case 'suitedash':
      return new SuitedashCrm(integration);
    case 'hubspot':
      throw new Error('HubSpot CRM integration is not yet supported.');
    case 'generic':
    default:
      return new GenericCrm(integration);
  }
};