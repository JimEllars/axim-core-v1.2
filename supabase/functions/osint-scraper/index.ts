
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getCorsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;

const TARGET_ENTITIES = [
    "James Ellars",
    "AXiM Systems",
    "American Tax Credit"
];

async function ingestUrl(entity: string, result: any) {
    const { url, title, snippet } = result;

    // 1. Idempotency Check
    const { data: existing } = await supabase
        .from('ai_memory_banks')
        .select('id')
        .eq('source_type', 'osint_web')
        .contains('metadata', { url: url })
        .maybeSingle();

    if (existing) {
        console.log(`Skipping already ingested URL: ${url}`);
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let extractedText = `${title}\n\n${snippet}\n\n[Full article content simulated...]`;

    try {
        const networkReq = fetch(url, { signal: controller.signal });

        const response = await Promise.race([
            networkReq,
            new Promise((_, reject) => {
               controller.signal.addEventListener('abort', () => reject(new Error('AbortError: Timeout')));
            })
        ]) as Response;

        if (response.ok) {
            extractedText = await response.text();
        }

    } catch(err) {
        console.error("OSINT Scraping network timeout:", err);
        // Gracefully record failed node state metric logic
        await supabase.from('api_usage_logs').insert({
            endpoint: '/functions/v1/osint-scraper/error',
            execution_time_ms: -1
        });
        return;
    } finally {
        clearTimeout(timeoutId);
    }


    console.log(`Ingesting new URL: ${url} for entity: ${entity}`);

    // Summarize context via llm-proxy
    let summarizedText = extractedText;
    try {
        const prompt = `Summarize the following text related to ${entity}:\n\n${extractedText.substring(0, 5000)}`;
        const llmRes = await fetch(llmProxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                provider: 'openai',
                prompt: prompt,
                options: { temperature: 0.3 }
            })
        });

        if (llmRes.ok) {
            const llmData = await llmRes.json();
            summarizedText = llmData.response || llmData.text || llmData.content || summarizedText;
        }
    } catch (e) {
        console.error("Error summarizing text:", e);
    }

    // Vectorization
    let embedding = null;
    try {
        const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ input: summarizedText })
        });
        if (embedRes.ok) {
            const embedData = await embedRes.json();
            embedding = embedData.embedding;
        }
    } catch (e) {
        console.error("Error generating embedding:", e);
    }

    // Store in ai_memory_banks
    const { error: memError } = await supabase
        .from('ai_memory_banks')
        .insert({
            content: summarizedText,
            source_type: `osint_web`,
            metadata: {
                url: url,
                entity: entity,
                source: "osint_web"
            },
            embedding: embedding
        });

    if (memError) {
        console.error("Failed to insert into ai_memory_banks:", memError);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
    }

    try {
        const payload = await req.json();

        // Google Spark unstructured lead ingestion path
        if (payload.action === 'ingest_unstructured_lead' && payload.raw_text) {
            const rawText = payload.raw_text;

            // Very simple NLP tokenization mock
            const company_match = rawText.match(/Company:\s*(.+)/i);
            const contact_match = rawText.match(/Contact:\s*(.+)/i);
            const email_match = rawText.match(/Email:\s*([\w.-]+@[\w.-]+)/i);
            const phone_match = rawText.match(/Phone:\s*([\d-]+)/i);
            const spend_match = rawText.match(/Spend:\s*\$?([\d,.]+)/i);
            const zip_match = rawText.match(/Zip(?: Code)?:\s*(\d{5})/i);

            const zipCodeStr = zip_match ? zip_match[1] : null;
            const zipCode = zipCodeStr ? parseInt(zipCodeStr, 10) : 0;

            const isWithinTerritory = zipCode >= 75601 && zipCode <= 75695;

            const extractedLead = {
                company_name: company_match ? company_match[1].trim() : null,
                contact_name: contact_match ? contact_match[1].trim() : null,
                email: email_match ? email_match[1].trim() : null,
                phone: phone_match ? phone_match[1].trim() : null,
                estimated_monthly_utility_spend: spend_match ? parseFloat(spend_match[1].replace(/,/g, '')) : null,
                facility_zip: zipCodeStr
            };

            const status = isWithinTerritory ? 'Pending_Review' : 'Out_of_Bounds_Assignment';

            return new Response(JSON.stringify({
                success: true,
                message: `Lead ingested with status ${status}`,
                lead_data: extractedLead,
                status: status
            }), {
                headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
            });
        }

        // Default OSINT scraper logic
        console.log("Starting OSINT Scraper polling...");

        for (const entity of TARGET_ENTITIES) {
             // Simulate search results
             const mockResults = [
                 {
                     url: `https://news.example.com/article-${Date.now()}-${entity.replace(/\s+/g, '-').toLowerCase()}`,
                     title: `Recent news about ${entity}`,
                     snippet: `There has been a recent development concerning ${entity}.`
                 }
             ];

             for (const result of mockResults) {
                 await ingestUrl(entity, result);
             }
        }

        return new Response(JSON.stringify({ success: true, message: "OSINT Scrape complete" }), {
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        // If req.json() fails because there's no body, proceed with polling
        if (error instanceof SyntaxError) {
            // Default OSINT scraper logic
            console.log("Starting OSINT Scraper polling...");

            for (const entity of TARGET_ENTITIES) {
                 // Simulate search results
                 const mockResults = [
                     {
                         url: `https://news.example.com/article-${Date.now()}-${entity.replace(/\s+/g, '-').toLowerCase()}`,
                         title: `Recent news about ${entity}`,
                         snippet: `There has been a recent development concerning ${entity}.`
                     }
                 ];

                 for (const result of mockResults) {
                     await ingestUrl(entity, result);
                 }
            }

            return new Response(JSON.stringify({ success: true, message: "OSINT Scrape complete" }), {
                headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
            });
        }

        console.error("Error in OSINT Scraper:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
