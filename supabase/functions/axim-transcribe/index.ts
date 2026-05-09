// supabase/functions/axim-transcribe/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

console.log('AXiM Transcribe Service function loaded');

serve(async (req) => {
  // Handle preflight requests for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const { source, userId } = await req.json();

    // Input validation
    if (!source || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: source and userId are required.' }),
        {
          headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log(`[AXiM Transcribe] Received request from user ${userId} to transcribe: ${source}`);

    // In a real scenario, this function would download the audio and call Whisper API.
    // For this implementation we mock the transcription text as if Whisper successfully processed the audio.
    const transcriptionId = `transcript_${new Date().getTime()}`;
    const mockTranscribedText = "This is a transcribed voice command from the user.";

    console.log(`[AXiM Transcribe] Transcription complete. ID: ${transcriptionId}`);

    return new Response(
      JSON.stringify({
        message: `Transcription initiated successfully.`,
        transcriptionId: transcriptionId,
        text: mockTranscribedText,
        status: 'completed',
      }),
      {
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[AXiM Transcribe] Error processing request:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process transcription request.', details: error.message }),
      {
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
