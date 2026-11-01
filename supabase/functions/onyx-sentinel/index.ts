import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { keysFromEnv, resolveCaller } from "../_shared/edgeAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NOTE: this file previously started a Postgres `LISTEN telemetry_alert_bus`
// loop at module scope. It could not work: `Client` has no
// `waitForNotification()` in @deno/postgres v0.17, and an Edge Function is torn
// down when the request ends, so a module-scope listener never survives. It was
// removed rather than left as a connection that opens and immediately dies.
// Real-time alerting belongs in a queue consumer or a cron-driven poller.

export const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'POST') {
      // Authentication.
      //
      // This handler had none. It writes into hitl_audit_logs with the
      // service-role key, and onyx-bridge feeds the last entries of that table
      // into the model as "historical precedents". An anonymous caller could
      // therefore inject text that later appears inside Onyx's system prompt.
      // Heartbeats come from internal services; operators use a JWT.
      const verifyUser = async (token: string): Promise<string | null> => {
        const { data, error } = await supabase.auth.getUser(token);
        return error || !data?.user ? null : data.user.id;
      };
      const caller = await resolveCaller(req.headers, keysFromEnv(Deno.env), verifyUser);
      if (caller.kind === 'anonymous') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const payload = await req.json();

      if (payload && payload.record && payload.record.status === 'offline') {
        const diagnosticPayload = {
          message: `Node ${payload.record.app_name} (${payload.record.id}) is offline.`,
          node_id: payload.record.id,
          app_name: payload.record.app_name,
          timestamp: new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('hitl_audit_logs')
          .insert([{
            action_type: 'SYSTEM_ALERT',
            status: 'pending',
            details: diagnosticPayload,
            user_id: null
          }]);

        if (insertError) {
          console.error("Failed to insert into hitl_audit_logs", insertError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
};

if (import.meta.main) {
  serve(handleRequest);
}
