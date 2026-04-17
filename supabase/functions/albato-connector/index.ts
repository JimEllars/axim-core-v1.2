
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    const apiKey = authHeader.split(' ')[1];
    const { data: keyData, error: keyError } = await supabaseClient
        .from('api_keys')
        .select('user_id')
        .eq('api_key', apiKey)
        .single();

    if (keyError || !keyData) {
        return new Response(JSON.stringify({ error: 'Invalid API Key' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    const userId = keyData.user_id;
    const url = new URL(req.url);
    const path = url.pathname.replace('/functions/v1/albato-connector', ''); // Strip base path if present (depends on deployment)
    // Actually, local serve might be just /, but deployed might include function name.
    // Let's matching on the suffix.

    // 2. Routing
    // Normalize path to ensure it starts with / and doesn't have duplicate slashes
    const cleanPath = path.replace(/\/+/g, '/');

    // POST /datasets/:name/ingest
    const ingestMatch = cleanPath.match(/^\/datasets\/([^/]+)\/ingest$/);
    if (req.method === 'POST' && ingestMatch) {
        return await handleIngest(req, supabaseClient, userId, ingestMatch[1]);
    }

    // GET /datasets/:name/query
    const queryMatch = cleanPath.match(/^\/datasets\/([^/]+)\/query$/);
    if (req.method === 'GET' && queryMatch) {
        return await handleQuery(req, supabaseClient, userId, queryMatch[1]);
    }

    // PATCH /assets/:id
    const assetMatch = cleanPath.match(/^\/assets\/([^/]+)$/);
    if (req.method === 'PATCH' && assetMatch) {
        return await handleUpdateAsset(req, supabaseClient, userId, assetMatch[1]);
    }

    // POST /annotations
    if (req.method === 'POST' && cleanPath === '/annotations') {
        return await handleCreateAnnotation(req, supabaseClient, userId);
    }

    // PUT /control/:unit_id
    const controlMatch = cleanPath.match(/^\/control\/([^/]+)$/);
    if (req.method === 'PUT' && controlMatch) {
        return await handleControl(req, supabaseClient, userId, controlMatch[1]);
    }

    return new Response(JSON.stringify({ error: 'Not Found', path: cleanPath }), {
        status: 404,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Albato Connector Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});

async function handleIngest(req: Request, supabase: any, userId: string, datasetName: string) {
    const body = await req.json();

    // Normalize input: Albato can send { events: [...] } or just [...] or single object
    let eventList: any[] = [];
    if (Array.isArray(body)) {
        eventList = body;
    } else if (body && Array.isArray(body.events)) {
        eventList = body.events;
    } else if (body && typeof body === 'object') {
        eventList = [body];
    } else {
        return new Response(JSON.stringify({ error: 'Invalid payload. Expected JSON object or array.' }), {
            status: 400,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    if (eventList.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, ids: [] }), {
            status: 201,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    // Prepare batch insert
    const records = eventList.map(event => ({
        type: datasetName,
        source: 'albato',
        data: event, // JSONB handles object automatically
        user_id: userId
    }));

    const { data, error } = await supabase
        .from('events_ax2024')
        .insert(records)
        .select('id');

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: data.length, ids: data.map((r: any) => r.id) }), {
        status: 201,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
}

async function handleQuery(req: Request, supabase: any, userId: string, datasetName: string) {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const fromDate = url.searchParams.get('from');
    const toDate = url.searchParams.get('to');

    let query = supabase
        .from('events_ax2024')
        .select('*')
        .eq('type', datasetName)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
}

async function handleUpdateAsset(req: Request, supabase: any, userId: string, assetId: string) {
    const updates = await req.json();

    // Allowed fields for update
    const allowed = ['device_name', 'status', 'system_info'];
    const filteredUpdates: any = {};
    Object.keys(updates).forEach(key => {
        if (allowed.includes(key)) filteredUpdates[key] = updates[key];
    });

    if (Object.keys(filteredUpdates).length === 0) {
        return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
            status: 400,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    // We must ensure we update only if user owns the device.
    // Since we use service role key, we must add .eq('user_id', userId) explicitly.
    const { data, error } = await supabase
        .from('devices')
        .update(filteredUpdates)
        .eq('id', assetId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        // If row not found (or not owned by user), .single() returns error code PGRST116
        if (error.code === 'PGRST116') {
             return new Response(JSON.stringify({ error: 'Asset not found or access denied' }), {
                status: 404,
                headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
            });
        }
        throw error;
    }

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
}

async function handleCreateAnnotation(req: Request, supabase: any, userId: string) {
    const body = await req.json();

    const { data, error } = await supabase
        .from('events_ax2024')
        .insert({
            type: 'annotation',
            source: 'albato',
            data: body,
            user_id: userId
        })
        .select()
        .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
}

async function handleControl(req: Request, supabase: any, userId: string, unitId: string) {
    let body = {};
    try {
        body = await req.json();
    } catch (e) {
        // Body might be empty if command is in query
    }

    const url = new URL(req.url);
    const command = body.command || url.searchParams.get('command');

    if (!command) {
        return new Response(JSON.stringify({ error: 'Command required in body or query' }), {
            status: 400,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

    // Log command event
    const eventData = {
        unit_id: unitId,
        command: command,
        status: 'pending'
    };

    const { data: event, error: eventError } = await supabase
        .from('events_ax2024')
        .insert({
            type: 'infrastructure_control',
            source: 'albato',
            data: eventData,
            user_id: userId
        })
        .select()
        .single();

    if (eventError) throw eventError;

    // Optionally update device status to 'busy'
    // We try, but don't fail the request if device not found (similar to gcp-backend logic)
    await supabase
        .from('devices')
        .update({ status: 'busy' })
        .eq('id', unitId)
        .eq('user_id', userId);

    return new Response(JSON.stringify(event), {
        status: 200,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
}
