const fs = require('fs');

let content = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');

const rateLimitResponse = `      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });`;

const newRateLimitResponse = `      const response = new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });

      const logPromise = supabaseAdmin.from('api_usage_logs').insert({
        api_key_id: apiKeyData.id,
        partner_id: partnerId,
        endpoint: endpoint,
        status_code: 429,
        compute_ms: Date.now() - startTime
      });

      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(logPromise);
      } else {
        logPromise.catch(console.error);
      }
      return response;`;

content = content.replace(rateLimitResponse, newRateLimitResponse);

const paymentResponse = `      return new Response(JSON.stringify({ error: 'Payment Required' }), {
        status: 402,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });`;

const newPaymentResponse = `      const response = new Response(JSON.stringify({ error: 'Payment Required' }), {
        status: 402,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });

      const logPromise = supabaseAdmin.from('api_usage_logs').insert({
        api_key_id: apiKeyData.id,
        partner_id: partnerId,
        endpoint: endpoint,
        status_code: 402,
        compute_ms: Date.now() - startTime
      });

      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(logPromise);
      } else {
        logPromise.catch(console.error);
      }
      return response;`;

content = content.replace(paymentResponse, newPaymentResponse);

fs.writeFileSync('supabase/functions/api-gateway/index.ts', content);
