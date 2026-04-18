import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;
const sendEmailUrl = Deno.env.get("SEND_EMAIL_URL") || `${supabaseUrl}/functions/v1/send-email`;

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    // Basic auth check for CRON trigger (could use a specific secret in practice)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        // 1. Get Fleet Snapshot
        const { data: fleetSnapshot, error: snapshotError } = await supabase.rpc('get_fleet_snapshot');
        if (snapshotError) throw new Error(`Fleet snapshot error: ${snapshotError.message}`);

        // 2. Query total B2B credits consumed
        // Assuming a partner_credits table exists with a total_consumed column or similar,
        // or we aggregate from micro_app_transactions where partner_id is not null.
        // For this example, we'll sum the cost from micro_app_transactions for the week.
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const { data: txData, error: txError } = await supabase
            .from('micro_app_transactions')
            .select('amount, credits_used')
            .gte('created_at', oneWeekAgo.toISOString());

        if (txError) throw new Error(`Transaction query error: ${txError.message}`);

        const totalCreditsConsumed = txData?.reduce((sum, tx) => sum + (tx.credits_used || 0), 0) || 0;
        const totalRevenue = txData?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;

        // 3. Prompt LLM Proxy
        const rawData = {
            fleetSnapshot,
            totalCreditsConsumed,
            totalRevenue,
            period: 'Last 7 Days',
            date: new Date().toISOString()
        };

        const prompt = `
            You are an automated executive reporting system for AXiM Core.
            Please generate a concise, professional HTML "Executive Briefing" based on the following data:
            ${JSON.stringify(rawData, null, 2)}

            The output MUST BE valid HTML suitable for email. Do not include markdown wrappers like \`\`\`html.
            Include styling for a clean, modern, dark-themed look (similar to a sleek dashboard).
            Highlight key metrics: Fleet Health, Transactions, Credits Consumed, and Revenue.
        `;

        const llmResponse = await fetch(llmProxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20240620",
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!llmResponse.ok) {
             const errorText = await llmResponse.text();
             throw new Error(`LLM proxy error: ${llmResponse.status} ${errorText}`);
        }

        const llmData = await llmResponse.json();
        const htmlContent = llmData.choices?.[0]?.message?.content || llmData.response || "<p>Error generating report content.</p>";

        // 4. Send Email
        const emailResponse = await fetch(sendEmailUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                to: "admin@axim.us.com", // Replace with actual admin team email
                subject: `AXiM Executive Briefing - ${new Date().toLocaleDateString()}`,
                html: htmlContent
            })
        });

        if (!emailResponse.ok) {
             const errorText = await emailResponse.text();
             throw new Error(`Email dispatch error: ${emailResponse.status} ${errorText}`);
        }

        return new Response(JSON.stringify({ success: true, message: "Executive report generated and sent." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Executive report error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
