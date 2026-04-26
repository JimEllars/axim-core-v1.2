import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const ROUNDUPS_API_KEY = Deno.env.get("ROUNDUPS_API_KEY");
const AXIM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;

const supabaseAdmin = createClient(SUPABASE_URL, AXIM_SERVICE_KEY as string);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${AXIM_SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "test_connection") {
      if (!ROUNDUPS_API_KEY) {
        return new Response(
          JSON.stringify({
            status: "failed",
            error: "ROUNDUPS_API_KEY not found",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ status: "connected", service: "roundups" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (action === "create_roundup") {
      if (!ROUNDUPS_API_KEY) {
        return new Response(
          JSON.stringify({ error: "ROUNDUPS_API_KEY not configured" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const {
        headline,
        target_audience,
        keywords,
        styles,
        product_type,
        products_count,
        products_search_queries,
        amazon_product_asins,
        product_urls,
      } = body;

      if (!headline && !target_audience && !keywords) {
        return new Response(
          JSON.stringify({
            error:
              "At least one of headline, target_audience, or keywords is required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Construct payload for Roundups.ai
      const payload: any = {};
      if (headline) payload.headline = headline;
      if (target_audience) payload.target_audience = target_audience;
      if (keywords) payload.keywords = keywords;
      if (styles) payload.styles = styles;
      if (product_type) payload.product_type = product_type;
      if (products_count) payload.products_count = products_count;
      if (products_search_queries) {
        payload.products_search_queries = products_search_queries;
      }
      if (amazon_product_asins) {
        payload.amazon_product_asins = amazon_product_asins;
      }
      if (product_urls) payload.product_urls = product_urls;

      const createResponse = await fetch(
        "https://roundups.ai/api/v1/roundups",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ROUNDUPS_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.text();
        return new Response(
          JSON.stringify({ error: "Roundups API error", details: errorData }),
          {
            status: createResponse.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await createResponse.json();

      // Insert into roundups_jobs
      if (data.id) {
        await supabaseAdmin.from("roundups_jobs").insert({
          remote_roundup_id: data.id,
          status: "generating",
          headline: data.headline || headline || keywords || "Roundup",
        });
      }

      return new Response(JSON.stringify({ status: "success", data }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_status") {
      if (!ROUNDUPS_API_KEY) {
        return new Response(
          JSON.stringify({ error: "ROUNDUPS_API_KEY not configured" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const { remote_roundup_id } = body;
      if (!remote_roundup_id) {
        return new Response(
          JSON.stringify({ error: "remote_roundup_id is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const fetchResponse = await fetch(
        `https://roundups.ai/api/v1/roundups/${remote_roundup_id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ROUNDUPS_API_KEY}`,
          },
        },
      );

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.text();
        return new Response(
          JSON.stringify({ error: "Roundups API error", details: errorData }),
          {
            status: fetchResponse.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await fetchResponse.json();

      // Update roundups_jobs status based on data.state
      if (data.state) {
        let newStatus = data.state;

        if (data.state === "timeout" || data.state === "error" || data.state === "failed") {
          newStatus = "failed";
        } else if (data.article) {
          newStatus = "completed";
        }

        const updatePayload: any = { status: newStatus };
        if (data.article) {
          updatePayload.article_url = data.article.url || data.article.link || data.article;
        }
        if (data.errors) {
          updatePayload.status = "failed";
        }

        await supabaseAdmin
          .from("roundups_jobs")
          .update(updatePayload)
          .eq("remote_roundup_id", remote_roundup_id);
      }

      return new Response(JSON.stringify({ status: "success", data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }


    if (action === "launch_campaign") {
      const internalKeyHeader = req.headers.get("X-Axim-Internal-Service-Key");
      const internalKey = Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") || "fallback_internal_key";

      if (!internalKeyHeader || internalKeyHeader !== internalKey) {
        return new Response(JSON.stringify({ error: "Forbidden: Internal Service Key required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { topic } = body;
      if (!topic) {
        return new Response(JSON.stringify({ error: "topic is required for launch_campaign" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: job, error: jobError } = await supabaseAdmin.from("roundups_jobs").insert({
        headline: topic,
        status: "pending",
      }).select().single();

      if (jobError) {
        return new Response(JSON.stringify({ error: "Failed to queue campaign", details: jobError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Notify Mr. Ellars via Universal Dispatcher
      const dispatcherUrl = `${SUPABASE_URL}/functions/v1/universal-dispatcher`;
      try {
        const dispatchRes = await fetch(dispatcherUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Internal-Service-Key': internalKey,
          },
          body: JSON.stringify({
            target_service: 'sms',
            action_type: 'send_sms',
            payload: {
              recipient: 'admin',
              message: `Traffic anomaly detected. Onyx has autonomously queued a new Roundups campaign for: ${topic}.`
            },
          }),
        });

        if (!dispatchRes.ok) {
           console.error("Failed to notify Mr. Ellars via Universal Dispatcher:", await dispatchRes.text());
        }
      } catch (notifyErr: any) {
        console.error("Error calling Universal Dispatcher:", notifyErr.message);
      }

      return new Response(JSON.stringify({ status: "success", message: "Campaign queued", job }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
