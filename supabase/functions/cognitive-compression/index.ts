import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';

serve(async (req) => {
    try {
        const authHeader = req.headers.get('Authorization');
        const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;

        const supabaseAdmin = createClient(
            supabaseUrl,
            expectedKey
        );

        // Fetch uncompressed interactions from the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

                const { data: logs, error: fetchError } = await supabaseAdmin
            .from('ai_interactions_ax2024')
            .select('id, user_id, command, response, created_at')
            .eq('compressed', false)
            .gte('created_at', oneDayAgo);

        if (fetchError) {
            throw new Error(`Failed to fetch interactions: ${fetchError.message}`);
        }

        if (!logs || logs.length === 0) {
            return new Response(JSON.stringify({ message: 'No logs to compress.' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Group by user_id
        const userLogs = {};
        for (const log of logs) {
            const uid = log.user_id || 'system';
            if (!userLogs[uid]) {
                userLogs[uid] = [];
            }
            userLogs[uid].push(log);
        }

        let totalCompressed = 0;
        for (const [uid, uLogs] of Object.entries(userLogs)) {
            // Prepare prompt for summarization
            const interactionsText = uLogs.map(l => `[${l.created_at}] Q: ${l.command}\nA: ${l.response}`).join('\n\n');
            const summaryPrompt = `Summarize the following AI interactions into a concise 'Executive Summary' of the day's insights, tasks, and key decisions:\n\n${interactionsText}`;

            // Invoke llm-proxy
            const llmResponse = await supabaseAdmin.functions.invoke('llm-proxy', {
                body: { prompt: summaryPrompt, system_prompt: "You are an executive summarization assistant." },
                headers: { 'Authorization': `Bearer ${expectedKey}` }
            });

            if (llmResponse.error) {
                console.warn(`LLM proxy error for user ${uid}: ${llmResponse.error.message}`);
                continue;
            }

            const summaryText = llmResponse.data?.response || llmResponse.data?.content || "Summary could not be generated.";

            let embedding = null;
            try {
                // Generate embedding for the summary
                const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${expectedKey}`
                    },
                    body: JSON.stringify({
                        input: summaryText
                    })
                });

                if (embedRes.ok) {
                    const embedData = await embedRes.json();
                    embedding = embedData.embedding;
                } else {
                    console.warn(`Failed to generate embedding for summary: ${embedRes.status} ${await embedRes.text()}`);
                }
            } catch (e) {
                console.warn('Embedding generation failed during compression:', e);
            }

            // Save summary to ai_memory_banks table
            const memoryData = {
                content: summaryText,
                source_type: 'daily_summary',
                metadata: { date: new Date().toISOString(), log_count: uLogs.length },
                embedding: embedding
            };
            if (uid !== 'system') {
                memoryData.user_id = uid;
            }

            const { error: memoryError } = await supabaseAdmin
                .from('ai_memory_banks')
                .insert(memoryData);

            if (memoryError) {
                console.warn(`Failed to save memory bank for user ${uid}: ${memoryError.message}`);
                continue;
            }

            // Flag raw logs as compressed
            const logIds = uLogs.map(l => l.id);
            const { error: updateError } = await supabaseAdmin
                .from('ai_interactions_ax2024')
                .update({ compressed: true })
                .in('id', logIds);

            if (updateError) {
                 console.warn(`Failed to update raw logs for user ${uid}: ${updateError.message}`);
                 continue;
            }

            totalCompressed += uLogs.length;
        }

        return new Response(JSON.stringify({
            message: 'Cognitive compression completed.',
            logs_compressed: logs.length
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Cognitive Compression Fatal Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});
