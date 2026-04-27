import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { marked } from 'https://esm.sh/marked@5.0.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { title, html_content, status = 'draft', author_id = 1 } = await req.json();

    if (!title || !html_content) {
      throw new Error("Missing title or html_content in payload");
    }

    // 1. Fetch credentials from ecosystem_connections vault
    const { data: wpConnection, error: vaultError } = await supabase
      .from('ecosystem_connections')
      .select('webhook_url, api_key')
      .eq('service_name', 'wordpress_main')
      .eq('status', 'active')
      .single();

    if (vaultError || !wpConnection) {
      throw new Error(`Failed to retrieve WordPress credentials: ${vaultError?.message || 'Not found'}`);
    }

    const { webhook_url: wpSiteUrl, api_key: applicationPassword } = wpConnection;
    // Assuming api_key stores "username:application_password"

    // Parse markdown to HTML if content looks like markdown
    let finalHtmlContent = html_content;
    if (html_content.includes('##') || html_content.includes('**')) {
      finalHtmlContent = marked(html_content);
    }

    // 2. Perform REST API POST to WordPress
    const authHeader = `Basic ${btoa(applicationPassword)}`;
    // wpSiteUrl should ideally be base url, e.g., https://wp.axim.us.com
    const wpEndpoint = `${wpSiteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

    const wpResponse = await fetch(wpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        title: title,
        content: finalHtmlContent,
        status: status,
        author: author_id
      })
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      throw new Error(`WordPress API Error (${wpResponse.status}): ${errorText}`);
    }

    const wpData = await wpResponse.json();
    const publishedUrl = wpData.link;

    // 3. Log Success to telemetry
    await supabase.from('telemetry_logs').insert({
      event_type: 'content_published',
      metadata: {
        title,
        wp_post_id: wpData.id,
        wp_url: publishedUrl,
        status: status
      }
    });

    return new Response(JSON.stringify({
      message: "Successfully published to WordPress",
      url: publishedUrl,
      id: wpData.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("WordPress Publisher Error:", error);

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Log CRITICAL error for Onyx to catch
      await supabase.from('telemetry_logs').insert({
        event_type: 'error',
        severity: 'CRITICAL',
        metadata: {
          source: 'wordpress-publisher',
          error: error.message
        }
      });
    } catch (telemetryError) {
      console.error("Failed to log critical error to telemetry:", telemetryError);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
