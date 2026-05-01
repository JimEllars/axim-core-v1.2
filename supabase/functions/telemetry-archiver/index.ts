import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const correlationId = req.headers.get('x-axim-correlation-id') || 'system-generated';


        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffDate = thirtyDaysAgo.toISOString();

        // 1. Archive Telemetry Logs
        const { data: logsToArchive, error: fetchError } = await supabase
            .from("telemetry_logs")
            .select("*")
            .lt("created_at", cutoffDate);

        // 2. Archive API Usage Logs
        const { data: apiLogsToArchive, error: apiFetchError } = await supabase
            .from("api_usage_logs")
            .select("*")
            .lt("timestamp", cutoffDate);

        // 3. Archive Satellite Pulses
        const { data: satelliteLogsToArchive, error: satelliteFetchError } = await supabase
            .from("satellite_pulses")
            .select("*")
            .lt("timestamp", cutoffDate);

        if (fetchError || apiFetchError || satelliteFetchError) {
            console.error(`[CID: ${correlationId}] Error fetching logs for archiving`);
            return new Response(JSON.stringify({ error: "Failed to fetch logs", correlationId }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
            });
        }

        const totalToArchive = (logsToArchive?.length || 0) + (apiLogsToArchive?.length || 0) + (satelliteLogsToArchive?.length || 0);

        if (totalToArchive === 0) {
            return new Response(JSON.stringify({ message: "No logs to archive", correlationId }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
            });
        }

        // Aggregate Data into daily metrics (simple implementation for historical_metrics or daily_metrics)
        const aggregatedData = {};

        if (apiLogsToArchive) {
            apiLogsToArchive.forEach(log => {
                const date = log.timestamp.split('T')[0];
                const appId = log.app_id || 'unknown';
                const key = `${date}-${appId}`;
                if (!aggregatedData[key]) aggregatedData[key] = { date, app_id: appId, total_requests: 0, errors: 0 };
                aggregatedData[key].total_requests++;
                if (log.status_code >= 400) aggregatedData[key].errors++;
            });
        }

        if (satelliteLogsToArchive) {
            satelliteLogsToArchive.forEach(log => {
                const date = log.timestamp.split('T')[0];
                const appId = log.app_id || 'unknown';
                const key = `${date}-${appId}`;
                if (!aggregatedData[key]) aggregatedData[key] = { date, app_id: appId, total_requests: 0, errors: 0 };
                aggregatedData[key].total_requests++;
                if (log.status === 'error' || log.status === 'failed') aggregatedData[key].errors++;
            });
        }

        // Insert into daily_metrics
        const metricsToInsert = Object.values(aggregatedData);
        if (metricsToInsert.length > 0) {
             const { error: insertError } = await supabase.from('daily_metrics').insert(metricsToInsert);
             if (insertError) {
                 console.error(`[CID: ${correlationId}] Error inserting aggregated metrics:`, insertError);
             }
        }

        // Compress logs using GZIP
        const archiveContent = JSON.stringify({
            telemetry: logsToArchive || [],
            api_usage: apiLogsToArchive || [],
            satellite_pulses: satelliteLogsToArchive || []
        });
        const encoder = new TextEncoder();
        const data = encoder.encode(archiveContent);

        const cs = new CompressionStream("gzip");
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();

        const compressedData = await new Response(cs.readable).arrayBuffer();

        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `telemetry-archive-${dateStr}.json.gz`;

        // Upload to secure_artifacts bucket
        const { error: uploadError } = await supabase
            .storage
            .from('log_archives')
            .upload(fileName, compressedData, {
                contentType: 'application/gzip',
                upsert: true
            });

        if (uploadError) {
             console.error(`[CID: ${correlationId}] Error uploading archive:`, uploadError);
             return new Response(JSON.stringify({ error: "Failed to upload archive", correlationId }), {
                 status: 500,
                 headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
             });
        }

        // Delete the archived logs
        if (logsToArchive && logsToArchive.length > 0) {
            const logIds = logsToArchive.map(log => log.id);
            await supabase.from("telemetry_logs").delete().in("id", logIds);
        }

        if (apiLogsToArchive && apiLogsToArchive.length > 0) {
            const apiLogIds = apiLogsToArchive.map(log => log.id);
            await supabase.from("api_usage_logs").delete().in("id", apiLogIds);
        }

        if (satelliteLogsToArchive && satelliteLogsToArchive.length > 0) {
            const satelliteLogIds = satelliteLogsToArchive.map(log => log.id);
            await supabase.from("satellite_pulses").delete().in("id", satelliteLogIds);
        }

        return new Response(JSON.stringify({ message: `Successfully archived ${totalToArchive} logs.`, correlationId }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
        });

    } catch (error) {
        const correlationId = req.headers.get('x-axim-correlation-id') || 'system-generated';
        console.error(`[CID: ${correlationId}] Telemetry archiver error:`, error);
        return new Response(JSON.stringify({ error: error.message, correlationId }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
        });
    }
});
