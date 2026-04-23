import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { date_range, export_type } = await req.json();

    let query = supabaseAdmin.from('api_usage_logs').select('*');

    // Partner only sees their logs. Admins can see all or we restrict based on user.id
    const { data: userData } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
       query = query.eq('partner_id', user.id);
    }

    if (date_range && date_range.start) {
      query = query.gte('created_at', date_range.start);
    }
    if (date_range && date_range.end) {
      query = query.lte('created_at', date_range.end);
    }

    if (export_type === 'security_events') {
      query = query.gte('status_code', 400);
    }

    const { data: logs, error: queryError } = await query;

    if (queryError) {
      throw queryError;
    }

    if (!logs || logs.length === 0) {
       return new Response(JSON.stringify({ error: 'No logs found for the given criteria.' }), {
         status: 404,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    // Convert to CSV
    const headers = ['id', 'api_key_id', 'partner_id', 'endpoint', 'status_code', 'compute_ms', 'created_at'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => headers.map(h => log[h] || '').join(','))
    ].join('\n');

    const fileName = \`audit_export_\${user.id}_\${Date.now()}.csv\`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .upload(fileName, csvContent, {
        contentType: 'text/csv',
        upsert: false
      });

    if (uploadError) {
      throw new Error(\`Failed to store artifact: \${uploadError.message}\`);
    }

    const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .createSignedUrl(fileName, 900);

    if (urlError || !signedUrlData) {
      throw new Error('Failed to generate signed URL');
    }

    return new Response(JSON.stringify({
      success: true,
      download_url: signedUrlData.signedUrl
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Audit Export Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
