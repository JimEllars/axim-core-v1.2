import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";

console.log("AXiM Transcribe Service function loaded - ASYNC UPDATE");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req.headers.get("origin")) });
  }

  try {
    // 1. Generate unique job ID
    const jobId = crypto.randomUUID();

    // Use setTimeout to process asynchronously without blocking the response
    setTimeout(async () => {
        try {
            console.log(`[AXiM Transcribe] Background processing for job ${jobId}`);

            // In a real scenario, we would send the payload to Noota here
            // with a callback URL pointing to /transcription-webhook
            const nootaUrl = Deno.env.get("NOOTA_API_URL") || "https://httpbin.org/post";
            const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/transcription-webhook`;

            // Mock call
            await fetch(nootaUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    job_id: jobId,
                    callback_url: callbackUrl,
                    audio: "mock_audio_blob"
                })
            });

            // For testing, since we might not have a real webhook setup,
            // we will simulate Noota calling back to our webhook
            setTimeout(async () => {
                await fetch(callbackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        job_id: jobId,
                        text: "This is a transcribed voice command completed asynchronously.",
                        status: "completed"
                    })
                }).catch(e => console.error("Simulated webhook failed", e));
            }, 2000);

        } catch (e) {
            console.error(`[AXiM Transcribe] Background task failed for ${jobId}:`, e);
        }
    }, 0);

    console.log(`[AXiM Transcribe] Accepted request, returning jobId ${jobId}`);

    // Return 202 Accepted immediately
    return new Response(
      JSON.stringify({
        message: "Transcription job accepted and processing in background",
        job_id: jobId,
        status: "processing"
      }),
      {
        headers: { ...getCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
        status: 202,
      }
    );
  } catch (error) {
    console.error("[AXiM Transcribe] Error handling request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to accept transcription request", details: error.message }),
      {
        headers: { ...getCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
