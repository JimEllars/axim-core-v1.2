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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffDate = thirtyDaysAgo.toISOString();

        // Query telemetry logs older than 30 days
        const { data: logsToArchive, error: fetchError } = await supabase
            .from("telemetry_logs")
            .select("*")
            .lt("created_at", cutoffDate);

        if (fetchError) {
            console.error("Error fetching telemetry logs:", fetchError);
            return new Response(JSON.stringify({ error: "Failed to fetch telemetry logs" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (!logsToArchive || logsToArchive.length === 0) {
            return new Response(JSON.stringify({ message: "No logs to archive" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
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
            .from('secure_artifacts')
            .upload(fileName, compressedData, {
                contentType: 'application/gzip',
                upsert: true
            });

        if (uploadError) {
             console.error("Error uploading archive:", uploadError);
             return new Response(JSON.stringify({ error: "Failed to upload archive" }), {
                 status: 500,
                 headers: { ...corsHeaders, "Content-Type": "application/json" },
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
             console.error("Error deleting archived logs:", deleteError);
             return new Response(JSON.stringify({ error: "Failed to delete archived logs" }), {
                 status: 500,
                 headers: { ...corsHeaders, "Content-Type": "application/json" },
             });
        }

        return new Response(JSON.stringify({ message: `Successfully archived ${logsToArchive.length} logs.` }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Telemetry archiver error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});