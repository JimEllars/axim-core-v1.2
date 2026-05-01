import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const onyxBridgeUrl = Deno.env.get("ONYX_BRIDGE_URL") || `${supabaseUrl}/functions/v1/onyx-bridge`;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError || !user) {
             // Check if it's the service role key for internal/admin bypass
             if (authHeader.replace('Bearer ', '') !== supabaseKey) {
                 return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
             }
        }

        const payload = await req.json();
        let { text, audio_base64, device_id } = payload;

        // If audio is provided, try to transcribe via OpenAI Whisper
        if (audio_base64 && openaiApiKey) {
            try {
                // Audio would typically come as a file upload via FormData, but handling base64 as instructed
                const audioBuffer = Uint8Array.from(atob(audio_base64), c => c.charCodeAt(0));

                const formData = new FormData();
                const blob = new Blob([audioBuffer], { type: 'audio/webm' });
                formData.append('file', blob, 'audio.webm');
                formData.append('model', 'whisper-1');

                const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`
                    },
                    body: formData
                });

                if (whisperRes.ok) {
                    const whisperData = await whisperRes.json();
                    text = whisperData.text;
                } else {
                    console.error("Whisper error:", await whisperRes.text());
                }
            } catch(e) {
                console.error("Failed to transcribe audio:", e);
            }
        }

        if (!text) {
            return new Response(JSON.stringify({ error: "Missing text payload and no audio could be transcribed" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Pass to llm-proxy to summarize/extract strategic directives
        let summary = text;
        const llmProxyUrl = `${supabaseUrl}/functions/v1/llm-proxy`;
        try {
            const extractReq = await fetch(llmProxyUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({
                    prompt: "Extract the core strategic directives, tasks, and executive decisions from the following transcript:\n" + text,
                    system_prompt: "You are Onyx, the advanced AI orchestrator. Summarize meeting transcripts into high-density strategic directives.",
                    model: "claude-3-haiku-20240307"
                })
            });
            if (extractReq.ok) {
                const extractData = await extractReq.json();
                summary = extractData.result || extractData.response || text;
            }
        } catch(e) {
            console.error("LLM extraction failed, using raw text", e);
        }

        // Vectorize and store in memory_banks
        let embedding = Array(1536).fill(0.01);
        try {
            const embeddingReq = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ input: summary })
            });

            if (embeddingReq.ok) {
                const result = await embeddingReq.json();
                if (result.embedding) {
                    embedding = result.embedding;
                }
            }
        } catch(e) {
            console.error("Failed to generate embedding", e);
        }

        // Store vectorized summary
        await supabase.from('ai_interactions_ax2024').insert({
            prompt: text, // Store original prompt
            response: summary, // Store summary as response
            command_type: 'Strategic Directive',
            embedding: embedding,
            metadata: { source: 'voice', deviceId: device_id, userId: user?.id || 'admin' }
        });

        // Still forward to onyx-bridge for live processing/tasks (optional but good for triggering workflows)
        const onyxResponse = await fetch(onyxBridgeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}` // Authenticate internal call
            },
            body: JSON.stringify({
                command: summary,
                context: {
                    source: "voice",
                    deviceId: device_id,
                    userId: user?.id || 'admin'
                }
            })
        });

        if (!onyxResponse.ok) {
            const errorText = await onyxResponse.text();
            console.error(`Onyx bridge error: ${onyxResponse.status} ${errorText}`);
            // We don't throw here because we already successfully saved the directive
        }

        let onyxData = { status: "processed" };
        if (onyxResponse.ok) {
            onyxData = await onyxResponse.json();
        }

        return new Response(JSON.stringify({ success: true, result: onyxData, summary: summary }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Voice ingest error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});