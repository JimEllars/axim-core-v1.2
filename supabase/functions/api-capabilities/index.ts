import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

// Dynamic import or manual reading might be safer in Edge Functions, but let's stick to import assert since Deno supports it.
import roundupsOpenApi from '../../src/api-specs/roundups_openapi.json' assert { type: "json" };
import suitedashOpenApi from '../../src/api-specs/suitedash_openapi.json' assert { type: "json" };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  const capabilities = [
    {
      product_id: 'demand_letter',
      name: 'Demand Letter Generator',
      description: 'Generates a formal demand letter.',
      required_schema: {
        type: 'object',
        properties: {
          recipientName: { type: 'string' },
          senderName: { type: 'string' },
          amount: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['recipientName', 'senderName', 'amount', 'reason']
      }
    },
    {
      product_id: 'nda_document',
      name: 'NDA Generator',
      description: 'Generates a Non-Disclosure Agreement.',
      required_schema: {
        type: 'object',
        properties: {
          partyOne: { type: 'string' },
          partyTwo: { type: 'string' },
          purpose: { type: 'string' }
        },
        required: ['partyOne', 'partyTwo', 'purpose']
      }
    }
  ];

  const externalCapabilities = [
    {
      product_id: 'roundups_api',
      name: 'Roundups Integration',
      description: 'Integrates with Roundups AI to create affiliate articles.',
      openapi_spec: roundupsOpenApi
    },
    {
      product_id: 'suitedash_api',
      name: 'SuiteDash CRM Integration',
      description: 'Integrates with SuiteDash CRM for managing contacts, projects, and marketing.',
      openapi_spec: suitedashOpenApi
    }
  ];

  return new Response(JSON.stringify([...capabilities, ...externalCapabilities]), {
    headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    status: 200,
  });
});
