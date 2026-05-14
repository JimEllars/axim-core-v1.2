import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

serve(async (req) => {
  // Simple auth for cron/internal triggering
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') as string,
    serviceRoleKey
  );

  try {
    const { record } = await req.json();

    if (record && record.event === 'ECOSYSTEM_NODE_DOWN') {
      const appName = record.details.app_name;

      const payload = {
        action: 'system_outage',
        status: 'pending',
        user_id: 'system', // Internal system user
        payload: {
          app_name: appName,
          health_endpoint_url: record.details.health_endpoint_url,
          timestamp: record.details.timestamp,
          diagnostic: `Onyx Sentinel detected outage for ${appName}. Suggested actions: Restart Worker, Clear Cache, Rollback Migration.`
        }
      };

      const { error } = await supabase.from('hitl_audit_logs').insert(payload);

      if (error) {
         console.error('Failed to insert HITL log:', error);
         return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      return new Response(JSON.stringify({ status: 'ok', message: 'HITL log created' }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ status: 'ignored', message: 'Not an ECOSYSTEM_NODE_DOWN event' }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Onyx Sentinel critical error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
