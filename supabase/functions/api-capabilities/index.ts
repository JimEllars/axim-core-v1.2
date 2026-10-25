import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

import roundupsOpenApi from '../../src/api-specs/roundups_openapi.json' assert { type: "json" };
import suitedashOpenApi from '../../src/api-specs/suitedash_openapi.json' assert { type: "json" };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    },
    {
      product_id: 'transcription',
      name: 'AXiM Audio Transcription Service',
      endpoint: '/api/v1/transcribe',
      auth_requirement: 'Bearer Token / Partner API Key',
      status: 'OPERATIONAL',
      schema_description: 'Accepts audio file buffers or URLs, returns transcribed JSON text payload.'
    },
    {
      product_id: 'ground-game',
      name: 'Canvassing and field assignment engine',
      endpoint: '/api/v1/groundgame/assign',
      auth_requirement: 'Bearer Token / Partner API Key',
      status: 'OPERATIONAL',
      schema_description: 'Accepts geography data, assigns turf areas to canvasser reps.'
    },
    {
      product_id: 'crm-sync',
      name: 'Universal contact and lead synchronization',
      endpoint: '/api/v1/crm/sync',
      auth_requirement: 'Bearer Token / Partner API Key',
      status: 'OPERATIONAL',
      schema_description: 'Accepts lead JSON payloads, pushes normalized data into internal CRMs.'
    },
    {
      product_id: 'vector-search',
      name: 'Semantic memory retrieval',
      endpoint: '/api/v1/search',
      auth_requirement: 'Bearer Token / Partner API Key',
      status: 'OPERATIONAL',
      schema_description: 'Accepts natural language queries, returns vectorized similarity matches.'
    },
    {
      product_id: 'robotics',
      name: "AXiM Robotics Lab Gateway",
      version: "1.0.0",
      status: "operational",
      endpoints: [
        "/api/v1/robotics/telemetry",
        "/api/v1/robotics/projects",
        "/api/v1/robotics/sim",
        "/api/v1/robotics/fleet/emergency-stop"
      ],
      auth_requirement: "X-Axim-Signature",
      mcp_compliant: true,
      supported_classes: ["hexapod", "quadruped", "rover", "arm"]
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-AXiM-RateLimit-Remaining': '999', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    status: 200,
  });
});
