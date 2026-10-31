import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { keysFromEnv, resolveCaller } from "../_shared/edgeAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Authentication.
  //
  // This endpoint had none and subscribed to five tables with the service-role
  // key: telemetry_events, blockchain_transactions, hitl_audit_logs,
  // groundgame_support_incidents and api_usage_logs — every row, every tenant,
  // streamed to anyone who knew the URL. It now requires a verified operator
  // session or an internal service credential.
  const verifyUser = async (token: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  };
  const caller = await resolveCaller(req.headers, keysFromEnv(Deno.env), verifyUser);
  if (caller.kind === "anonymous") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  let timerId: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: any) => {
        try {
            const str = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(new TextEncoder().encode(str));
        } catch (e) {
            console.error("Error enqueuing event", e);
        }
      };

      // 1. Send initial heartbeat to establish connection
      sendEvent({ type: "heartbeat", timestamp: new Date().toISOString() });

      // 2. Setup 15-second heartbeat
      timerId = setInterval(() => {
        sendEvent({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 15000);

      // 3. Subscribe to Realtime channels
      const realtimeChannel = supabase.channel('telemetry_events_stream')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'telemetry_events' },
          (payload) => {
            sendEvent({
              event_type: 'telemetry_event',
              app_id: payload.new.component_id || 'system',
              payload: payload.new,
              timestamp: payload.new.created_at || new Date().toISOString()
            });
          }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'blockchain_transactions' },
            (payload) => {
              sendEvent({
                event_type: 'blockchain_transaction',
                app_id: payload.new.partner_id || 'system',
                payload: payload.new,
                timestamp: payload.new.created_at || new Date().toISOString()
              });
            }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' },
            (payload) => {
              sendEvent({
                event_type: 'hitl_audit_log',
                app_id: 'support_system',
                payload: payload.new,
                timestamp: payload.new.created_at || new Date().toISOString()
              });
            }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'groundgame_support_incidents' },
            (payload) => {
              sendEvent({
                event_type: 'groundgame_incident',
                app_id: 'groundgame',
                payload: payload.new,
                timestamp: payload.new.created_at || new Date().toISOString()
              });
            }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'api_usage_logs' },
            (payload) => {
              if (payload.new.app_id === 'onyx-core') {
                  sendEvent({
                    event_type: 'onyx_thought_token',
                    app_id: 'onyx-core',
                    payload: payload.new,
                    timestamp: payload.new.created_at || new Date().toISOString()
                  });
              }
            }
        )
        .subscribe();

      req.signal.addEventListener("abort", () => {
        console.log("Client disconnected");
        clearInterval(timerId);
        supabase.removeChannel(realtimeChannel);
        controller.close();
      });
    },
    cancel() {
      clearInterval(timerId);
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
};

if (import.meta.main) {
  serve(handleRequest);
}
