const fs = require('fs');
const filePath = 'supabase/functions/api-gateway/index.ts';
let content = fs.readFileSync(filePath, 'utf8');

const webhookRouting = `
    if (req.method === 'POST' && endpoint === '/api/v1/external-webhook') {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      const eventSource = body.event_source;
      if (!eventSource) {
        return new Response(JSON.stringify({ error: 'Missing event_source' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (eventSource === 'tabby') {
        // Map Tabby accounting payloads
        const amount = body.payload?.amount || 0;
        const type = body.payload?.type; // 'revenue' or 'expense'
        const eventTag = type === 'expense' ? 'expense_logged' : 'revenue_cleared';

        EdgeRuntime.waitUntil(
          supabaseAdmin.from('telemetry_logs').insert({
            event: eventTag,
            app_type: 'tabby-accounting',
            timestamp: new Date().toISOString(),
            details: {
              amount,
              raw_payload: body.payload
            }
          })
        );
        return new Response(JSON.stringify({ success: true, message: 'Tabby webhook processed' }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      } else if (eventSource === 'roundups') {
        // Map RoundUps affiliate payloads
        const eventType = body.payload?.event_type; // 'article_published' or 'affiliate_click'
        const eventTag = eventType === 'article_published' ? 'article_published' : 'affiliate_click';

        EdgeRuntime.waitUntil(
          supabaseAdmin.from('telemetry_logs').insert({
            event: eventTag,
            app_type: 'roundups-affiliate',
            timestamp: new Date().toISOString(),
            details: {
              raw_payload: body.payload
            }
          })
        );
        return new Response(JSON.stringify({ success: true, message: 'RoundUps webhook processed' }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown event_source' }), {
        status: 400,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

`;

// Insert the new route handler right after the telemetry ingestion handler
const insertionPoint = '    let body;';
const beforeInsertionPoint = `
      return new Response(JSON.stringify({ success: true, message: 'Telemetry event accepted' }), {
        status: 202,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }
`;
content = content.replace(beforeInsertionPoint, beforeInsertionPoint + '\n' + webhookRouting);
fs.writeFileSync(filePath, content);
