import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

const DEFAULT_TOPICS = [
  'Latest trends in Solar Energy software',
  'AI in Construction Management',
  'Business Automation for Contractors',
  'Sustainable Energy Market Analysis',
  'The Future of Field Service Management'
];

// Helper: Handle Gemini API Call
async function generateWithGemini(apiKey: string, prompt: string) {
  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates.");
  }
  return data.candidates[0].content.parts[0].text;
}

// Fetch active affiliate partners
async function getAffiliatePartners(supabase: any) {
  const { data, error } = await supabase
    .from('affiliate_partners')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error("Error fetching affiliate partners:", error);
    return [];
  }
  return data || [];
}

// Simple semantic matching based on keywords in category and description
function matchPartnerToTopic(topic: string, partners: any[]) {
  if (!partners || partners.length === 0) return null;

  const topicLower = topic.toLowerCase();

  // Scoring partners
  const scoredPartners = partners.map(partner => {
    let score = 0;
    const categoryWords = partner.category.toLowerCase().split(/[_\s]+/);
    const descWords = partner.context_description.toLowerCase().split(/\s+/);

    categoryWords.forEach((word: string) => {
      if (word.length > 3 && topicLower.includes(word)) score += 3;
    });

    descWords.forEach((word: string) => {
      if (word.length > 4 && topicLower.includes(word)) score += 1;
    });

    return { partner, score };
  });

  // Sort descending by score
  scoredPartners.sort((a, b) => b.score - a.score);

  // If we have a matching score > 0, return the best one.
  // Otherwise, optionally return a random partner or null.
  if (scoredPartners[0].score > 0) {
    return scoredPartners[0].partner;
  }

  // Fallback: pick random active partner
  return partners[Math.floor(Math.random() * partners.length)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    let topics = [];
    let urls = [];
    try {
        const body = await req.json();
        if (body.topics && Array.isArray(body.topics)) {
            topics = body.topics;
        }
        if (body.urls && Array.isArray(body.urls)) {
            urls = body.urls;
        }
    } catch (e) {
        // Body parsing failed or empty, ignore
    }

    const results = [];
    const activePartners = await getAffiliatePartners(supabase);

    if (urls.length > 0) {
        console.log(`Processing ${urls.length} URLs concurrently...`);
        await Promise.all(urls.map(async (url) => {
            console.log(`Scraping URL: ${url}`);
            try {
                let sourceContent = '';
                try {
                  const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('axim-scraper', {
                      body: { url }
                  });
                  if (scrapeError || !scrapeData?.content) throw new Error(scrapeError?.message || 'No content');
                  sourceContent = scrapeData.content;
                } catch (scrapeErr) {
                   console.warn(`axim-scraper failed for ${url}, falling back to direct fetch.`, scrapeErr);
                   const resp = await fetch(url);
                   if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.statusText}`);
                   sourceContent = await resp.text();
                }

                const truncatedContent = sourceContent.substring(0, 10000);

                // Try to find a partner based on URL (simple fallback to random if url doesn't have keywords)
                const matchedPartner = matchPartnerToTopic(url, activePartners);

                let prompt = `
                  You are an expert tech and business journalist.
                  Rewrite the following source content into a compelling, professional news article or blog post.
                  Focus on key insights, actionable takeaways, and industry trends.

                  Source URL: ${url}
                  Source Content:
                  ${truncatedContent}

                  Guidelines:
                  - Title: Catchy and SEO-friendly.
                  - Tone: Professional, authoritative, yet accessible.
                  - Structure: Introduction, Key Points, Analysis, Conclusion.
                  - Length: 600-800 words.
                  - Formatting: Markdown.
                `;

                if (matchedPartner) {
                  prompt += `

                  IMPORTANT INSTRUCTION:
                  You must organically recommend the following tool in the article.
                  Tool: ${matchedPartner.partner_name}
                  Why it's good: ${matchedPartner.context_description}
                  You must hyperlink it using exactly this URL: ${matchedPartner.custom_link}
                  Make the recommendation feel helpful and native to the content.
                  `;
                }

                const articleContent = await generateWithGemini(apiKey, prompt);
                await processAndSaveArticle(supabase, articleContent, `Scraped from ${url}`, 'url_rewrite', results, matchedPartner);

            } catch (err) {
                console.error(`Failed to process URL ${url}:`, err);
                results.push({ source: url, status: 'failed', error: err.message });
            }
        }));
    }

    if (topics.length > 0 || (urls.length === 0 && topics.length === 0)) {
        if (topics.length === 0) {
             const randomTopic = DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
             topics = [randomTopic];
        }

        console.log(`Processing ${topics.length} topics concurrently...`);
        await Promise.all(topics.map(async (topic) => {
             console.log(`Processing topic: ${topic}`);
             try {
                const matchedPartner = matchPartnerToTopic(topic, activePartners);

                let prompt = `
                  Write a high-quality, engaging news article or blog post about: "${topic}".

                  Guidelines:
                  - Target Audience: Contractors, Solar Installers, Business Owners.
                  - Tone: Professional, authoritative, and actionable.
                  - Structure: Catchy Title, Introduction, Key Trends/Insights, Practical Advice, Conclusion.
                  - Length: 600-800 words.
                  - Format: Markdown.
                `;

                if (matchedPartner) {
                  prompt += `

                  IMPORTANT INSTRUCTION:
                  You must organically recommend the following tool in the article.
                  Tool: ${matchedPartner.partner_name}
                  Why it's good: ${matchedPartner.context_description}
                  You must hyperlink it using exactly this URL: ${matchedPartner.custom_link}
                  Make the recommendation feel helpful and native to the content.
                  `;
                }

                const articleContent = await generateWithGemini(apiKey, prompt);
                await processAndSaveArticle(supabase, articleContent, topic, 'topic_generation', results, matchedPartner);

             } catch (err) {
                 console.error(`Failed to process topic ${topic}:`, err);
                 results.push({ source: topic, status: 'failed', error: err.message });
             }
        }));
    }

    return new Response(JSON.stringify({
        message: "Content Engine execution completed.",
        results
    }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Content Engine Fatal Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});

async function processAndSaveArticle(supabase: any, content: string, source: string, method: string, results: any[], injectedPartner: any) {
    const articleContent = content;

    // Extract Title
    const titleMatch = articleContent.match(/^#\s+(.+)$/m) || articleContent.match(/^\*\*(.+)\*\*$/m);
    const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '').trim() : `Article: ${source}`;

    const metadata = {
        injected_partner: injectedPartner ? injectedPartner.partner_name : null,
        provider: 'gemini',
        method: method,
        generated_at: new Date().toISOString()
    };

    // Save to Database
    const { data, error } = await supabase
        .from('generated_content_ax2024')
        .insert({
            title: title,
            content: articleContent,
            topic: source,
            status: 'published',
            metadata: metadata
        })
        .select()
        .single();

    if (error) {
        console.error(`Failed to save article for "${source}":`, error);
        results.push({ source, status: 'failed', error: error.message });
    } else {
        console.log(`Saved article: ${title}`);
        results.push({ source, status: 'success', id: data.id, title });

        // HITL integration
        try {
            const wpPayload = {
                title: title,
                html_content: articleContent,
                status: "publish",
                author_id: 1,
                description: `Publish article: ${title}`
            };
            const { error: hitlError } = await supabase
                .from("hitl_audit_logs")
                .insert({
                    admin_id: "00000000-0000-0000-0000-000000000000", // Fallback service user uuid (ideally we fetch actual admin)
                    action: "publish_article",
                    tool_called: JSON.stringify(wpPayload),
                    status: "pending"
                });
            if (hitlError) throw hitlError;
            console.log(`Article queued for approval: ${title}`);
        } catch (hitlErr) {
            console.error(`Failed to queue article ${data.id} for approval:`, hitlErr);
        }
    }
}
