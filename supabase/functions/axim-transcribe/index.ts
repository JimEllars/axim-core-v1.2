// supabase/functions/axim-transcribe/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

console.log('AXiM Transcribe Service function loaded');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle preflight requests for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { source, userId } = await req.json();

    // Input validation
    if (!source || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: source and userId are required.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log(`[AXiM Transcribe] Received request from user ${userId} to transcribe: ${source}`);

    // This is a mock implementation.
    // In a real scenario, this function would:
    // 1. Validate the source URL.
    // 2. Download the audio file.
    // 3. Call an external speech-to-text API (e.g., Google Speech-to-Text, AssemblyAI).
    // 4. Store the transcription result in the database.
    // 5. Notify the user upon completion (e.g., via a real-time channel).

    const transcriptionId = `transcript_${new Date().getTime()}`;

    console.log(`[AXiM Transcribe] Mock transcription complete. ID: ${transcriptionId}`);

    return new Response(
      JSON.stringify({
        message: `Transcription for "${source}" initiated successfully.`,
        transcriptionId: transcriptionId,
        status: 'processing',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[AXiM Transcribe] Error processing request:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process transcription request.', details: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
