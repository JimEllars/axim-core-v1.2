// supabase/functions/device-communication/index.ts
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

serve(async (req) => {
  const { message } = await req.json()
  console.log(`Received message: ${message}`)

  return new Response(
    JSON.stringify({ message: `Message received: ${message}` }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
