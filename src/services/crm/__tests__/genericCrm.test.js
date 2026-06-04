import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenericCrm from '../genericCrm.js';
import api from '../../onyxAI/api';
import * as sanitization from '../../../utils/sanitization.js';

// Mock dependencies
vi.mock('../../onyxAI/api', () => {
  return {
    default: {
      supabaseApiService: {
        supabase: {
          from: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ error: null })
        }
      },
      bulkAddContacts: vi.fn().mockResolvedValue([
        { id: 1, email: 'test1@test.com' },
        { id: 2, email: 'test2@test.com' }
      ])
    }
  };
});

vi.mock('../../../utils/sanitization.js', () => {
  return {
    sanitizePayload: vi.fn((data) => data)
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('GenericCrm', () => {
  const mockIntegration = {
    name: 'Test CRM',
    base_url: 'https://test-crm.com/api'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter out contacts that are out of bounds geographically', async () => {
    const mockUsers = [
      { name: 'In Bounds 1', email: 'in1@test.com', facility_zip: '75601' },
      { name: 'In Bounds 2', email: 'in2@test.com', facility_zip: '75695' },
      { name: 'In Bounds Specific', email: 'in3@test.com', facility_zip: '75654' },
      { name: 'Out of Bounds 1', email: 'out1@test.com', facility_zip: '75000' },
      { name: 'Out of Bounds 2', email: 'out2@test.com', facility_zip: '75700' },
      { name: 'No Zip', email: 'nozip@test.com' }
    ];

    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockUsers
    });

    const crm = new GenericCrm(mockIntegration);
    const result = await crm.syncContacts();

    // Out of bounds are removed (2 out of bounds), so 6 total - 2 = 4 mapped over.
    // wait, 'No Zip' has no facility_zip, it stays.
    // in1, in2, in3, nozip => 4.
    expect(result.synced).toBe(4);

    // Check bulkAddContacts payload
    const bulkAddCall = api.bulkAddContacts.mock.calls[0];
    const contactsToImport = bulkAddCall[0];

    expect(contactsToImport.length).toBe(4);
    expect(contactsToImport.some(c => c.name === 'Out of Bounds 1')).toBe(false);
    expect(contactsToImport.some(c => c.name === 'Out of Bounds 2')).toBe(false);
    expect(contactsToImport.some(c => c.name === 'In Bounds 1')).toBe(true);
    expect(contactsToImport.some(c => c.name === 'No Zip')).toBe(true);
  });
});
