import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;
const sendEmailUrl = Deno.env.get("SEND_EMAIL_URL") || `${supabaseUrl}/functions/v1/send-email`;

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    // Basic auth check for CRON trigger
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        // 1. Get Fleet Snapshot
        const { data: fleetSnapshot, error: snapshotError } = await supabase.rpc('get_fleet_snapshot');
        if (snapshotError) throw new Error(`Fleet snapshot error: ${snapshotError.message}`);

        // 2. Data Aggregation: Fetch last 24 hours of api_usage_logs
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const isoOneDayAgo = oneDayAgo.toISOString();

        const { data: usageLogs, error: usageError } = await supabase
            .from('api_usage_logs')
            .select('*')
            .gte('created_at', isoOneDayAgo);

        if (usageError) throw new Error(`API usage query error: ${usageError.message}`);

        // Aggregate usage stats
        const apiUsageSummary = (usageLogs || []).reduce((acc: any, log: any) => {
            acc[log.endpoint] = (acc[log.endpoint] || 0) + 1;
            return acc;
        }, {});

        // 3. Fetch latest dense summaries from memory_banks
        const { data: memoryBanks, error: memoryError } = await supabase
            .from('memory_banks')
            .select('executive_summary, key_decisions, summary_date')
            .order('summary_date', { ascending: false })
            .limit(3);

        if (memoryError) throw new Error(`Memory banks query error: ${memoryError.message}`);

        // 4. Prompt LLM Proxy
        const rawData = {
            fleetSnapshot,
            apiUsage24h: apiUsageSummary,
            totalApiRequests24h: usageLogs?.length || 0,
            recentOnyxMemories: memoryBanks,
            period: 'Last 24 Hours',
            date: new Date().toISOString()
        };

        const prompt = `
            You are the Chief Operating Officer of AXiM Core.
            Please generate a concise, professional HTML "Daily Executive Brief" based on the following telemetry and Onyx strategic memory data:
            ${JSON.stringify(rawData, null, 2)}

            The output MUST BE valid HTML suitable for email. Do not include markdown wrappers like \`\`\`html.
            Include styling for a clean, modern, dark-themed look.
            Highlight key metrics: Fleet Health, 24h API Usage, and Strategic Memories/Key Decisions.
            Provide actionable insights if anomalies or trends are detected.
        `;

        // The llm-proxy expects { provider, prompt, options }
        const llmResponse = await fetch(llmProxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}` // Using service key which acts as user if llm proxy accepts it or we might need to proxy to claude
            },
            body: JSON.stringify({
                provider: "claude",
                prompt: prompt,
                options: {
                    model: "claude-3-haiku-20240307",
                    max_tokens: 1500,
                    temperature: 0.5
                }
            })
        });

        if (!llmResponse.ok) {
             const errorText = await llmResponse.text();
             throw new Error(`LLM proxy error: ${llmResponse.status} ${errorText}`);
        }

        const llmData = await llmResponse.json();
        const htmlContent = llmData.content || "<p>Error generating report content.</p>";

        // 5. Send Email
        const emailResponse = await fetch(sendEmailUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                to: "admin@axim.us.com", // Send to admin
                subject: `AXiM Daily Executive Brief - ${new Date().toLocaleDateString()}`,
                body: htmlContent, // send-email uses body/text for HTML
                app_source: "Executive Report"
            })
        });

        if (!emailResponse.ok) {
             const errorText = await emailResponse.text();
             throw new Error(`Email dispatch error: ${emailResponse.status} ${errorText}`);
        }

        return new Response(JSON.stringify({ success: true, message: "Daily Executive Brief generated and sent." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("Executive report error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
