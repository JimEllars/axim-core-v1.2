import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenericCrm from '../genericCrm';
import api from '../../onyxAI/api';
import { sanitizePayload } from '../../../utils/sanitization';

vi.mock('../../onyxAI/api', () => ({
  default: {
    supabaseApiService: {
      supabase: {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      },
    },
  },
}));

vi.mock('../../../utils/sanitization', () => ({
  sanitizePayload: vi.fn((data) => data),
}));

// Mock fetch
global.fetch = vi.fn();

describe('GenericCrm', () => {
  let crm;
  const mockIntegration = { name: 'TestCRM', base_url: 'http://test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    crm = new GenericCrm(mockIntegration);
  });

  it('should filter out contacts that are out of bounds geographically', async () => {
    const mockData = [
      { name: 'Out of Bounds 1', email: 'oob1@test.com', facility_zip: '75600' },
      { name: 'Out of Bounds 2', email: 'oob2@test.com', facility_zip: '75696' },
      { name: 'In Bounds 1', email: 'ib1@test.com', facility_zip: '75650' },
      { name: 'No Zip', email: 'nozip@test.com', facility_zip: null },
    ];

    // First fetch for genericCrm sync contacts
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });
    // Second fetch for the Data Plane postgrest
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    await crm.syncContacts();

    // Check fetch payload to the Data Plane
    const dataPlaneCall = fetch.mock.calls[1];
    const contactsToImport = JSON.parse(dataPlaneCall[1].body);

    expect(contactsToImport.length).toBe(2);
    expect(contactsToImport.some(c => c.name === 'Out of Bounds 1')).toBe(false);
    expect(contactsToImport.some(c => c.name === 'Out of Bounds 2')).toBe(false);
    expect(contactsToImport.some(c => c.name === 'In Bounds 1')).toBe(true);
    expect(contactsToImport.some(c => c.name === 'No Zip')).toBe(true);
  });
});
