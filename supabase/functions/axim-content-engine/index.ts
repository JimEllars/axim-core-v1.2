import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const AFFILIATE_LINKS = {
  'solar': 'https://example.com/solar-affiliate',
  'energy': 'https://example.com/energy-affiliate',
  'foreman': 'https://foremanos.com/affiliate',
  'software': 'https://example.com/software-affiliate',
  'AI': 'https://example.com/ai-tools-affiliate',
  'automation': 'https://example.com/automation-affiliate',
  'growth': 'https://example.com/growth-affiliate'
};

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
        maxOutputTokens: 2048, // Increased for longer articles
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

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Get input (topics or urls) from body
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

    // Mode 1: URL Scraping & Rewriting
    if (urls.length > 0) {
        console.log(`Processing ${urls.length} URLs concurrently...`);
        await Promise.all(urls.map(async (url) => {
            console.log(`Scraping URL: ${url}`);
            try {
                // 1. Scrape Content (using axim-scraper if available, or fetch)
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

                // Truncate content to avoid token limits
                const truncatedContent = sourceContent.substring(0, 10000); // 10k chars approx

                // 2. Generate/Rewrite Article
                const prompt = `
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

                const articleContent = await generateWithGemini(apiKey, prompt);

                // 3. Inject Links & Save (reusing logic below)
                await processAndSaveArticle(supabase, articleContent, `Scraped from ${url}`, 'url_rewrite', results, AFFILIATE_LINKS);

            } catch (err) {
                console.error(`Failed to process URL ${url}:`, err);
                results.push({ source: url, status: 'failed', error: err.message });
            }
        }));
    }

    // Mode 2: Topic-based Generation (Fallback or explicit)
    if (topics.length > 0 || (urls.length === 0 && topics.length === 0)) {
        if (topics.length === 0) {
             // Pick one random topic
             const randomTopic = DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
             topics = [randomTopic];
        }

        console.log(`Processing ${topics.length} topics concurrently...`);
        await Promise.all(topics.map(async (topic) => {
             console.log(`Processing topic: ${topic}`);
             try {
                 const prompt = `
                  Write a high-quality, engaging news article or blog post about: "${topic}".

                  Guidelines:
                  - Target Audience: Contractors, Solar Installers, Business Owners.
                  - Tone: Professional, authoritative, and actionable.
                  - Structure: Catchy Title, Introduction, Key Trends/Insights, Practical Advice, Conclusion.
                  - Length: 600-800 words.
                  - Format: Markdown.
                `;

                const articleContent = await generateWithGemini(apiKey, prompt);
                await processAndSaveArticle(supabase, articleContent, topic, 'topic_generation', results, AFFILIATE_LINKS);

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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Content Engine Fatal Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processAndSaveArticle(supabase: any, content: string, source: string, method: string, results: any[], affiliateLinks: any) {
    // 1. Inject Affiliate Links (Simple Regex for now, could be improved)
    let injectedCount = 0;
    let articleContent = content;
    Object.entries(affiliateLinks).forEach(([keyword, link]) => {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'i');
        if (regex.test(articleContent)) {
            // Only replace the first occurrence to avoid spamminess
            if (!articleContent.includes(`](${link})`)) {
                 articleContent = articleContent.replace(regex, `[$1](${link})`);
                 injectedCount++;
            }
        }
    });

    // 2. Extract Title
    const titleMatch = articleContent.match(/^#\s+(.+)$/m) || articleContent.match(/^\*\*(.+)\*\*$/m);
    const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '').trim() : `Article: ${source}`;

    // 3. Save to Database
    const { data, error } = await supabase
        .from('generated_content_ax2024')
        .insert({
            title: title,
            content: articleContent,
            topic: source, // Storing source (URL or Topic) in 'topic' column
            status: 'published',
            metadata: {
                injected_links_count: injectedCount,
                provider: 'gemini',
                method: method,
                generated_at: new Date().toISOString()
            }
        })
        .select()
        .single();

    if (error) {
        console.error(`Failed to save article for "${source}":`, error);
        results.push({ source, status: 'failed', error: error.message });
    } else {
        console.log(`Saved article: ${title}`);
        results.push({ source, status: 'success', id: data.id, title });
    }
}
