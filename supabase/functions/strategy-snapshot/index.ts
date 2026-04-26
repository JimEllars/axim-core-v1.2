import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const INTERNAL_SERVICE_KEY = Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const internalKeyHeader = req.headers.get("X-Axim-Internal-Service-Key");
  if (!internalKeyHeader || internalKeyHeader !== INTERNAL_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

    // 1. Total Revenue (last 24h)
    const { data: vaultRecords, error: _vaultError } = await supabaseAdmin
      .from("vault_records")
      .select("id")
      .gte("created_at", twentyFourHoursAgo);

    const { data: transactions, error: txError } = await supabaseAdmin
      .from("micro_app_transactions")
      .select("amount")
      .gte("created_at", twentyFourHoursAgo);

    let totalRevenue = 0;
    if (!txError && transactions) {
      totalRevenue = transactions.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
    }

    const vaultCount = vaultRecords ? vaultRecords.length : 0;
    const documentRevenue = vaultCount * 49;

    totalRevenue = totalRevenue > 0 ? totalRevenue : documentRevenue;

    // Revenue Reconciliation Integration
    const { count: recentLeaksCount, error: leakError } = await supabaseAdmin
      .from("telemetry_logs")
      .select("*", { count: "exact", head: true })
      .eq("event", "revenue_leak")
      .gte("timestamp", twentyFourHoursAgo);

    // 2. Traffic Highlights (last 24h) and Spike Detection
    const { data: telemetry, error: telemetryError } = await supabaseAdmin
      .from("telemetry_logs")
      .select("app_type, event, details, timestamp")
      .gte("timestamp", twentyFourHoursAgo);

    let lastHourCount = 0;
    let previous23HoursCount = 0;

    const trafficHighlights = {
      total_events: telemetry ? telemetry.length : 0,
      active_apps: {} as Record<string, number>,
    };

    if (!telemetryError && telemetry) {
      telemetry.forEach((log: any) => {
        if (log.app_type) {
          trafficHighlights.active_apps[log.app_type] = (trafficHighlights.active_apps[log.app_type] || 0) + 1;
        }

        if (log.timestamp >= oneHourAgo) {
          lastHourCount++;
        } else {
          previous23HoursCount++;
        }
      });
    }

    const averageHourlyRate = previous23HoursCount / 23;
    const velocityMultiplier = averageHourlyRate > 0 ? lastHourCount / averageHourlyRate : (lastHourCount > 0 ? lastHourCount : 0);
    const isTrafficSpiking = velocityMultiplier > 1.5; // Threshold for spiking

    // 3. Marketing Status
    const { data: roundups, error: roundupsError } = await supabaseAdmin
      .from("roundups_jobs")
      .select("status")
      .gte("created_at", twentyFourHoursAgo);

    const marketingStatus = {
      completed: 0,
      failed: 0,
      generating: 0,
    };

    if (!roundupsError && roundups) {
      roundups.forEach((job: any) => {
        if (job.status === "completed") marketingStatus.completed++;
        else if (job.status === "failed") marketingStatus.failed++;
        else if (job.status === "generating") marketingStatus.generating++;
      });
    }

    // 4. Active Ecosystem Verification
    const targetBridges = ["roundups", "stripe", "zapier"];
    const { data: connections, error: connectionsError } = await supabaseAdmin
      .from("ecosystem_connections")
      .select("service_name")
      .in("service_name", targetBridges)
      .eq("status", "active");

    const activeBridges = connections && !connectionsError
      ? connections.map((c: any) => c.service_name)
      : [];

    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          total_revenue_last_24h: totalRevenue,
          recent_leaks_count: recentLeaksCount || 0,
          traffic_highlights: trafficHighlights,
          velocity: {
            last_hour_events: lastHourCount,
            average_hourly_rate_23h: averageHourlyRate,
            velocity_multiplier: velocityMultiplier,
            is_traffic_spiking: isTrafficSpiking
          },
          marketing_status: marketingStatus,
          active_bridges: activeBridges,
          timestamp: new Date().toISOString()
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
