import { describe, it, expect } from 'vitest';
import { getCrmService } from '../index';
import SalesforceCrm from '../salesforceCrm';
import SuitedashCrm from '../suitedashCrm';
import GenericCrm from '../genericCrm';

describe('getCrmService', () => {
  it('should return a SalesforceCrm instance for provider "salesforce"', () => {
    const integration = { credentials: { provider: 'salesforce', client_id: 'test', client_secret: 'test' } };
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(SalesforceCrm);
    expect(service.integration).toEqual(integration);
  });

  it('should return a SuitedashCrm instance for provider "suitedash"', () => {
    const integration = { credentials: { provider: 'suitedash', public_id: 'test', secret_key: 'test' } };
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(SuitedashCrm);
    expect(service.integration).toEqual(integration);
  });

  it('should throw an error for provider "hubspot"', () => {
    const integration = { credentials: { provider: 'hubspot' } };
    expect(() => getCrmService(integration)).toThrow('HubSpot CRM integration is not yet supported.');
  });

  it('should return a GenericCrm instance for provider "generic"', () => {
    const integration = { credentials: { provider: 'generic' } };
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(GenericCrm);
    expect(service.integration).toEqual(integration);
  });

  it('should return a GenericCrm instance for unknown provider', () => {
    const integration = { credentials: { provider: 'unknown-provider' } };
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(GenericCrm);
    expect(service.integration).toEqual(integration);
  });

  it('should return a GenericCrm instance when provider is undefined', () => {
    const integration = { credentials: {} };
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(GenericCrm);
    expect(service.integration).toEqual(integration);
  });

  it('should return a GenericCrm instance when credentials is undefined', () => {
    const integration = {};
    const service = getCrmService(integration);
    expect(service).toBeInstanceOf(GenericCrm);
    expect(service.integration).toEqual(integration);
  });
});
