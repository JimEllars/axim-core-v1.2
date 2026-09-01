Task 1: Asguard Telephony Threat Verification
- Update `supabase/functions/voice-ingest/index.ts` to call the Asguard WAF endpoint BEFORE logging.
- `POST ${Deno.env.get('ASGUARD_API_URL')}/api/v1/telephony/threat-check` with `{ caller_number, sip_source_ip, call_sid }` and header `X-Axim-Signature: ${Deno.env.get('AXIM_INTERNAL_KEY') || supabaseKey}`.
- If `risk_level === 'CRITICAL'` or `is_blocked === true`:
  - Log to `telephony_logs` with `is_spam: true` and `threat_score: risk_score`.
  - Return early (skip VIP push / LLM proxy / Onyx processing).
- Make sure variables like `sip_source_ip` are extracted from request if available, or just passed as extracted/default.

Task 2: DLQ Exhaustion Real-Time Broadcast
- Update `supabase/functions/dead_letter_jobs/index.ts`.
- When a job exceeds `max_retries`:
  - Run a raw SQL `NOTIFY telemetry_events` (or a Postgres function, or just an RPC if needed, wait, Supabase JS `rpc` or direct Postgres notify? Oh wait, we can just use `supabase.rpc` or simply insert into `telemetry_events` which triggers `proc_notify_telemetry_breach()`. The instructions explicitly say: "Execute `NOTIFY telemetry_events` with payload: { ... }"). Since Supabase JS v2 doesn't have a direct `notify` method, we might need to use an RPC, or maybe we can just use `supabase.from('telemetry_events').insert()` since there is a trigger `proc_notify_telemetry_breach` that does exactly `PERFORM pg_notify('telemetry_alert_bus', ...)` but the task specifically says "Execute `NOTIFY telemetry_events`". Or maybe I can execute it via a REST call? Wait, `rpc` might be the best way, but let's see if there's a simpler way or if we can use an existing SQL executor. Ah! There's `safe_sql_executor` perhaps. Or we can just use RPC.
  - Wait, I will just call `supabase.rpc('execute_sql', { query: ... })` or similar if it exists. Let's check `migrations/` for what we have. Or maybe we just insert into the events table. I'll check how to `NOTIFY`. Actually, maybe `supabase.rpc` can just be created.
  - Or wait... can we just use `supabase.from('telemetry_events').insert`? The prompt says "Execute NOTIFY telemetry_events with payload". Wait, `telemetry_events` is the channel or the table? The trigger `proc_notify_telemetry_breach` notifies `telemetry_alert_bus`. Maybe they mean the channel `telemetry_events`? "Execute NOTIFY telemetry_events with payload: {...}" I'll create an RPC to execute NOTIFY if one doesn't exist, or just check the codebase for how NOTIFY is usually called.

Task 3: Vector RAG Knowledge Base Ingestion Pipeline
- Update `supabase/functions/knowledge-ingest/index.ts`.
- Process `{ title, content, category, tags, source_app }`. (Wait, currently it gets `{ title, text, source_type, file_path, category, partner }`. The instruction says `{ title, content, category, tags, source_app }`).
- Chunk content into <= 500 token segments. `chunkText(text, maxLen = 500, overlap = 50)`. Token approx is ~4 chars per token, so `maxLen = 2000` chars? The instruction says "500-token segments". I can update the default chunker to 2000 characters, which is roughly 500 tokens.
- Invoke `supabase/functions/generate-embedding/index.ts` to compute embeddings (Oh, the instructions say "Invoke `supabase/functions/generate-embedding/index.ts` to compute 1536-dim vector embeddings". Wait, currently `knowledge-ingest` calls OpenAI directly. I should change it to call `generate-embedding` locally or via fetch `generate-embedding` function).
- Insert records into `public.knowledge_base` with embedding vectors. (Currently it inserts into `executive_knowledge_base` or `ai_memory_banks`).
- Return `{ success: true, article_id: ..., chunks_indexed: ... }`. Wait, if I insert into `knowledge_base`, I might need an `article_id`. Let's check the schema of `knowledge_base`.
