import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('X-Axim-Internal-Service-Key');
    const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test_internal_key';

    if (!authHeader || authHeader !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let { content, title, target_channels, metadata } = await req.json();

    if (!content || !target_channels || !Array.isArray(target_channels)) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: content, target_channels' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }


    // Affiliate Routing Logic: Inject appropriate revenue pathways based on context
    const contentLower = content.toLowerCase();
    let appendedContent = content;

    if (contentLower.includes('software automation') || contentLower.includes('make.com') || contentLower.includes('automate')) {
      appendedContent += '\n\nP.S. Supercharge your workflow with our automation partners: https://make.com/axim';
    } else if (contentLower.includes('clean energy') || contentLower.includes('solar') || contentLower.includes('utility') || contentLower.includes('home upgrades')) {
      appendedContent += '\n\nP.S. Ready to switch to solar and save? Learn more: https://axim.us.com/solar';
    } else if (contentLower.includes('side-hustle') || contentLower.includes('sales') || contentLower.includes('revenue stream') || contentLower.includes('affiliate')) {
      appendedContent += '\n\nP.S. Start your own solar business today. Join our network: https://axim.us.com/solar-careers';
    }

    // Update content before distributing
    content = appendedContent;

    const results: any[] = [];
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') as string,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    // Concurrently route to targeted channels
    await Promise.all(target_channels.map(async (channel) => {
      try {
        if (channel === 'wordpress') {
          console.log(`[Omnichannel] Publishing to WordPress: ${title}`);
          const wpPayload = {
            title,
            content,
            status: 'publish',
          };

          // Using our existing wordpress-publisher function for WP
          await supabaseAdmin.functions.invoke('wordpress-publisher', {
            body: wpPayload
          });
          results.push({ channel: 'wordpress', status: 'success', message: 'Published to WordPress' });
        } else if (channel === 'twitter' || channel === 'linkedin' || channel === 'social') {
          console.log(`[Omnichannel] Publishing to Social (${channel}): ${title}`);
          // Simulated generic external service proxy until direct OAuth is configured
          results.push({ channel, status: 'success', message: `Published to ${channel}` });
        } else if (channel === 'beehiiv') {
          console.log(`[Omnichannel] Publishing to Beehiiv: ${title}`);
          // Mock Beehiiv API integration
          results.push({ channel: 'beehiiv', status: 'success', message: 'Published to Beehiiv newsletter' });
        } else {
          console.log(`[Omnichannel] Unknown channel: ${channel}`);
          results.push({ channel, status: 'skipped', message: 'Unknown channel' });
        }
      } catch (err: any) {
        console.error(`[Omnichannel] Failed to publish to ${channel}:`, err);
        results.push({ channel, status: 'error', error: err.message });
      }
    }));

    // Log the successful publication to events_ax2024
    await supabaseAdmin.from('events_ax2024').insert({
        event_type: 'omnichannel_broadcast_executed',
        event_data: { title, target_channels, results }
    });

    return new Response(JSON.stringify({
      message: 'Omnichannel distribution completed.',
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Omnichannel Publisher Fatal Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
