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

        // Query telemetry logs older than 30 days
        const { data: logsToArchive, error: fetchError } = await supabase
            .from("telemetry_logs")
            .select("*")
            .lt("created_at", cutoffDate);

        if (fetchError) {
            console.error(`[CID: ${correlationId}] Error fetching telemetry logs:`, fetchError);
            return new Response(JSON.stringify({ error: "Failed to fetch telemetry logs", correlationId }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
            });
        }

        if (!logsToArchive || logsToArchive.length === 0) {
            return new Response(JSON.stringify({ message: "No logs to archive", correlationId }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
            });
        }

        // Compress logs using GZIP
        const archiveContent = JSON.stringify(logsToArchive);
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

        // Extract IDs to delete
        const logIds = logsToArchive.map(log => log.id);

        // Delete the archived logs in batches if necessary, or all at once if supported by the array size
        const { error: deleteError } = await supabase
            .from("telemetry_logs")
            .delete()
            .in("id", logIds);

        if (deleteError) {
             console.error(`[CID: ${correlationId}] Error deleting archived logs:`, deleteError);
             return new Response(JSON.stringify({ error: "Failed to delete archived logs", correlationId }), {
                 status: 500,
                 headers: { ...corsHeaders, "Content-Type": "application/json", "x-axim-correlation-id": correlationId },
             });
        }

        return new Response(JSON.stringify({ message: `Successfully archived ${logsToArchive.length} logs.`, correlationId }), {
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
