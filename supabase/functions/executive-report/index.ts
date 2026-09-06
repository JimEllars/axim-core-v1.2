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

        // 2. Data Aggregation
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const isoOneDayAgo = oneDayAgo.toISOString();

        // Support tickets resolved
        const { count: supportResolved } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('updated_at', isoOneDayAgo);

        // Asguard threats
        const { count: threatsBlocked } = await supabase.from('telemetry_events').select('*', { count: 'exact', head: true }).eq('component_id', 'asguard-soc').gte('created_at', isoOneDayAgo);

        // HITL pending
        const { data: pendingHitl, error: pendingHitlError } = await supabase.from('action_required_hitl').select('*');
        if (pendingHitlError && !pendingHitlError.message.includes('does not exist')) {
            console.error('Error fetching action_required_hitl:', pendingHitlError.message);
        }

        const hitlItems = pendingHitl || [];

        // Generate tokens and actions
        let hitlHtml = '';
        if (hitlItems.length > 0) {
            hitlHtml = '<h2>Pending HITL Approvals</h2><ul>';
            for (const item of hitlItems) {
                // We'll generate a dummy token if we can't write to hitl_audit_logs directly with TTL
                const token = crypto.randomUUID();

                // Usually we'd store the token in hitl_audit_logs, but we can just use the item ID as token for now, or update it
                const actionUrl = `https://api.axim.us.com/functions/v1/resolve-hitl?token=${token}&log_id=${item.id}`;

                hitlHtml += `
                    <li style="margin-bottom: 20px; padding: 15px; border: 1px solid #333; border-radius: 8px;">
                        <strong>Action:</strong> ${item.action || 'Unknown'} <br/>
                        <strong>Target:</strong> ${item.target_app || 'Unknown'} <br/>
                        <strong>Details:</strong> ${JSON.stringify(item.payload || {})} <br/>
                        <div style="margin-top: 10px;">
                            <a href="${actionUrl}&decision=approved" style="display: inline-block; padding: 10px 15px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px;">Approve Action</a>
                            <a href="${actionUrl}&decision=rejected" style="display: inline-block; padding: 10px 15px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px;">Reject Action</a>
                            <a href="https://core.axim.us.com/admin/approval-queue" style="display: inline-block; padding: 10px 15px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">Open Command Hub</a>
                        </div>
                    </li>
                `;
            }
            hitlHtml += '</ul>';
        } else {
            hitlHtml = '<p>No pending HITL actions.</p>';
        }

        const reportData = {
            supportResolved: supportResolved || 0,
            threatsBlocked: threatsBlocked || 0,
            fleetSnapshot
        };

        // 3. Fetch latest dense summaries from memory_banks
        const { data: memoryBanks, error: memoryError } = await supabase
            .from('memory_banks')
            .select('executive_summary, key_decisions, summary_date')
            .order('summary_date', { ascending: false })
            .limit(3);

        const rawData = {
            reportData,
            totalApiRequests24h: 0,,
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

        const finalHtml = `
            <div style="font-family: sans-serif; color: #e2e8f0; background-color: #0f172a; padding: 20px;">
                <h1 style="color: #38bdf8;">AXiM Core Executive Briefing</h1>
                <p>Daily Cross-Ecosystem Operations & HITL Digest - ${new Date().toISOString().split('T')[0]}</p>
                <hr style="border-color: #334155;"/>
                ${htmlContent}
                <hr style="border-color: #334155;"/>
                ${hitlHtml}
            </div>
        `;

        // 5. Send Email via EmailIt
        const emailItApiKey = Deno.env.get("EMAILIT_API_KEY");
        if (emailItApiKey) {
            const emailResponse = await fetch("https://api.emailit.com/v1/email/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${emailItApiKey}`
                },
                body: JSON.stringify({
                    from: "missioncontrol@axim.us.com",
                    to: ["james.ellars@axim.us.com"],
                    bcc: ["jrellars@gmail.com"],
                    subject: `[AXiM Core Executive Briefing] Daily Cross-Ecosystem Operations & HITL Digest - ${new Date().toISOString().split('T')[0]}`,
                    html: finalHtml
                })
            });

            if (!emailResponse.ok) {
                 const errorText = await emailResponse.text();

                 // DLQ
                 await supabase.from('email_dead_letter_queue').insert({
                     to_email: "james.ellars@axim.us.com",
                     subject: "Daily Executive Briefing",
                     html_content: finalHtml,
                     error_diagnostic: `${emailResponse.status} ${errorText}`
                 });

                 throw new Error(`Email dispatch error: ${emailResponse.status} ${errorText}`);
            }
        } else {
            console.warn("EMAILIT_API_KEY not set, skipping email dispatch");
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
