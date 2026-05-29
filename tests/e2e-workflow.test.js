import { describe, it, expect } from 'vitest';

describe('End-to-End Workflow Validation', () => {
  it('should sanitize PII in the payload', async () => {
    const { sanitizePayload } = await import('../supabase/functions/telemetry-archiver/sanitization.ts');

    const payload = {
      "meta": {
        "event_id": "evt_9832abc7492f",
        "event_type": "lead.created"
      },
      "data": {
        "lead": {
          "contact": {
            "email": "m.vance_demo@example.com",
            "phone": "+1-555-019-8372"
          },
          "location": {
            "street_address": "1234 Security Way, Suite 100"
          }
        }
      }
    };

    const scrubbed = sanitizePayload(payload);

    expect(scrubbed.data.lead.contact.email).toBe('[REDACTED]');
    expect(scrubbed.data.lead.contact.phone).toBe('[REDACTED]');
    expect(scrubbed.data.lead.location.street_address).toBe('[REDACTED]');
  });
});
