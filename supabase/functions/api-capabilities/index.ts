import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
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

  return new Response(JSON.stringify(capabilities), {
    headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    status: 200,
  });
});
