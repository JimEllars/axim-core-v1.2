import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;


    let user = null;
    if (!isServiceRole) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader! } } }
      );

      const { data: authData, error: userError } = await supabaseClient.auth.getUser();
      user = authData.user;

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
      }
    }


    const onyxEdgeUrl = Deno.env.get('ONYX_EDGE_URL');
    const onyxEdgeSecret = Deno.env.get('ONYX_EDGE_SECRET');

    if (!onyxEdgeUrl || !onyxEdgeSecret) {
      return new Response(JSON.stringify({ error: 'Onyx Edge configuration is missing on the server.' }), {
        status: 500,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      });
    }

    let bodyData = await req.json();

    // Onyx Recursive Intelligence (Audit Learning)
    // Join hitl_audit_logs to find the last 5 'Approve' actions
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: recentApprovals, error: auditError } = await supabaseAdmin
      .from('hitl_audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);

    if (!auditError && recentApprovals && recentApprovals.length > 0) {
       // Inject as Historical Precedents into the context or prompt
       const precedents = recentApprovals.filter(log => log.action === 'Approve').slice(0, 5).map(log => `Approved: Tool ${log.tool_called} at ${log.timestamp}`);
       const rejections = recentApprovals.filter(log => log.action === 'Deny' || log.action === 'Reject' || log.action === 'deny').slice(0, 3).map(log => `Rejected: Tool ${log.tool_called} at ${log.timestamp} - DO NOT DO THIS`);
       if (!bodyData.context) bodyData.context = {};
       bodyData.context.historical_precedents = [...precedents, ...rejections];
    }


    // Ecosystem Discovery
    const { data: activeApps, error: appsError } = await supabaseAdmin
      .from('ecosystem_apps')
      .select('*')
      .eq('is_active', true)
      .eq('status', 'online');

    if (!appsError && activeApps && activeApps.length > 0) {
      if (!bodyData.context) bodyData.context = {};
      bodyData.context.available_tools = activeApps.map(app => ({
        type: 'function',
        function: {
          name: app.app_id,
          description: `Access the ${app.app_id} micro-app. Use this tool when the user requests functionality related to ${app.app_id}.`
        }
      }));
    }

    // --- Vectorize Attachments Immediately ---
    let attachmentNote = '';
    if (bodyData.attachments && Array.isArray(bodyData.attachments) && bodyData.attachments.length > 0) {
        // Run vectorization synchronously so Onyx can search it immediately if needed
        for (const att of bodyData.attachments) {
           try {
               const url = new URL(req.url);
               const protocol = url.protocol;
               const host = url.host;
               const knowledgeIngestUrl = `${protocol}//${host}/knowledge-ingest`;

               // We invoke knowledge-ingest
               // Note: This requires the storage path.
               // We uploaded to secure_artifacts in the frontend

               const { data: fileData, error: downloadError } = await supabaseAdmin.storage
                  .from('secure_artifacts')
                  .download(att.path);

               if (!downloadError && fileData) {
                  const text = await fileData.text();

                  await fetch(knowledgeIngestUrl, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({
                          title: att.name,
                          text: text,
                          source_type: 'attachment'
                      })
                  });
                  attachmentNote += `[System Note: The user has attached a document named '${att.name}'. Its contents have just been added to your vector memory. Use your query_strategic_memory tool to read it if necessary to answer their prompt.]\n`;
               }
           } catch (err) {
               console.error("Failed to vectorize attachment:", err);
           }
        }
    }

    // Check target domain or context for Persona switching

    let agent_id = 'onyx';
    let personaPrompt = "You are Onyx, the infrastructure operator...";
    const promptText = (bodyData.prompt || bodyData.command || '').toLowerCase();
    const contextStr = JSON.stringify(bodyData.context || {}).toLowerCase();

    let isPolitical = false;
    if (bodyData.options && bodyData.options.domain_context) {
        isPolitical = bodyData.options.domain_context === 'ellars_political';
    } else if (bodyData.agent_id && bodyData.agent_id.includes('political')) {
        isPolitical = true;
    } else {
        isPolitical = promptText.includes("ellars.us.com") || contextStr.includes("ellars.us.com") || promptText.includes("political");
    }

    const personaAxim = `
Voice: Professional, highly innovative Founder & President of AXiM Systems. Authoritative, strategic, and business-focused.
Core Philosophy: Focuses on leveraging cutting-edge automation, AI orchestration, and efficient systems to drive business value and create high-leverage digital products.`;

    const personaPolitical = `
Voice: Grounded, working-class advocate, relatable. Raised in Hesperia/Victorville, CA. 4th of 6 children.
Core Philosophy: "Put people first." The Fourth Industrial Revolution must serve human potential. Advocates for the American Tax Credit and a proactive $12,000/year "Automation Dividend" funded by taxing corporate automation to eliminate the tax cliff.`;

    const jamesPersona = isPolitical ? personaPolitical : personaAxim;

    // Inject James Ellars persona into the base Onyx prompt
    personaPrompt = `You are Onyx, the AI digital clone of James Ellars.
    ${jamesPersona}
    You are also the infrastructure operator for AXiM Core.`;



    // RAG Context Injection (Phase 8)
    const retrieveMemory = async () => {
      try {
        const url = new URL(req.url);
        const protocol = url.protocol;
        const host = url.host; // includes port if running locally
        // Edge function direct fetch or relative endpoint
        const memoryRetrievalUrl = `${protocol}//${host}/memory-retrieval`;

        const memoryReq = await fetch(memoryRetrievalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Internal-Service-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
          },
          body: JSON.stringify({
            query: promptText,
            threshold: 0.78,
            limit: 5,
            user_id: user?.id
          })
        });

        if (memoryReq.ok) {
           const memoryData = await memoryReq.json();
           return memoryData;
        }
        return null;
      } catch (e) {
        console.warn('Memory retrieval fetch failed:', e.message);
        return null;
      }
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1500));

    // We only try to fetch memory if there is a prompt text
    let memoryResults = null;
    if (promptText) {
        memoryResults = await Promise.race([retrieveMemory(), timeoutPromise]);
    }

    let memoryContext = '';
    if (memoryResults) {
       // Knowledge Partitioning: filter out "American Tax Credit" when not political
       if (!isPolitical) {
           if (Array.isArray(memoryResults)) {
               memoryResults = memoryResults.filter((r: any) => !(r.response && r.response.includes("American Tax Credit")) && !(r.command && r.command.includes("American Tax Credit")));
           } else {
               if (memoryResults.chat_context) memoryResults.chat_context = memoryResults.chat_context.filter((r: any) => !(r.response && r.response.includes("American Tax Credit")) && !(r.command && r.command.includes("American Tax Credit")));
               if (memoryResults.strategic_context) memoryResults.strategic_context = memoryResults.strategic_context.filter((r: any) => !(r.content && r.content.includes("American Tax Credit")));
           }
       }

       let memories = '';
       // Handle legacy structure (array) or new structure (object)
       if (Array.isArray(memoryResults)) {
           memories += memoryResults.map((r: any) => `User Command: ${r.command} | AI Response: ${r.response}`).join(`\n`);
       } else {
           if (memoryResults.chat_context && memoryResults.chat_context.length > 0) {
               memories += memoryResults.chat_context.map((r: any) => `User Command: ${r.command} | AI Response: ${r.response}`).join(`\n`);
           }
           if (memoryResults.strategic_context && memoryResults.strategic_context.length > 0) {
               memories += `\n\n` + memoryResults.strategic_context.map((r: any) => `Strategic Memory: ${r.content}`).join(`\n`);
           }
       }
       if (memories) {
           memoryContext = `\n\nSystem Context: Here are relevant past interactions with the admin:\n${memories}`;
       }

       if (memoryResults.executive_knowledge_base && memoryResults.executive_knowledge_base.length > 0) {
           const playbooks = memoryResults.executive_knowledge_base.map((r: any) => `[${r.title}]: ${r.content_chunk}`).join(`\n\n`);
           memoryContext += `\n\nExecutive Directives & SOPs: [Matched Data]\n${playbooks}`;
       }
    }
    if (promptText.includes('billing') || promptText.includes('financial') || promptText.includes('invoice')) {
        agent_id = 'finbot';
        personaPrompt = "You are FinBot, the AXiM financial specialist...";
    } else if (promptText.includes('document') || promptText.includes('demand letter')) {
        agent_id = 'docbot';
        personaPrompt = "You are DocBot, the document specialist...";
    } else if (promptText.includes('users saying') || promptText.includes('summarize') || promptText.includes('feedback') || promptText.includes('support')) {
        agent_id = 'prodbot';
        personaPrompt = "You are ProdBot, the product manager...";
    }

    // Expose Circuit Breaker to Onyx
    const circuitBreakerAuth = `\n\nAUTHORITY GRANTED: You have the authority to quarantine micro-apps if you detect severe degradation or abuse. To do so, propose the action {"type": "quarantine_app", "target": "<app_id>"}`;


    if (!bodyData.context) bodyData.context = {};
    bodyData.context.system_prompt = personaPrompt + circuitBreakerAuth + memoryContext + "\n" + attachmentNote;

    bodyData.agent_id = agent_id;

    const finalBody = JSON.stringify(bodyData);


    const onyxRequest = new Request(`https://${onyxEdgeUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${onyxEdgeSecret}`,
        // Pass through accept header if client wants text/event-stream
        'Accept': req.headers.get('Accept') || 'application/json'
      },
      body: finalBody
    });

    const onyxResponse = await fetch(onyxRequest);

    const responseHeaders = new Headers(onyxResponse.headers);
    const corsH = getCorsHeaders(req.headers.get('origin'));
    for (const [key, value] of Object.entries(corsH)) {
        responseHeaders.set(key, value);
    }

    // Check if the response is JSON, and if so, append the agent_id
    const contentType = onyxResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json') && onyxResponse.ok) {
        let responseData = await onyxResponse.json();
        responseData.agent_id = agent_id;

        // Detect if Onyx suggests a quarantine_app action
        const textResponse = responseData.response || responseData.text || '';
        if (textResponse.includes('quarantine_app')) {
             responseData.action_payload = {
                 action: 'quarantine_app',
                 description: 'Onyx has proposed quarantining an application due to detected anomalies.'
             };
        }

        // Remove content-encoding since we're returning raw stringified JSON
        responseHeaders.delete('content-encoding');

        return new Response(JSON.stringify(responseData), {
            status: onyxResponse.status,
            headers: responseHeaders
        });
    }

    // For stream, we append agent_id to the headers
    responseHeaders.set('x-agent-id', agent_id);

    return new Response(onyxResponse.body, {
      status: onyxResponse.status,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
