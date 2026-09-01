Task 1: Asguard Telephony Threat Verification
- In `supabase/functions/voice-ingest/index.ts`, parse `sip_source_ip` from the payload (or default it).
- Call `ASGUARD_API_URL/api/v1/telephony/threat-check` with body `{ caller_number, sip_source_ip, call_sid }` and header `X-Axim-Signature: ${Deno.env.get('AXIM_INTERNAL_KEY') || supabaseKey}`.
- If `risk_level === 'CRITICAL'` or `is_blocked === true`:
  - `await supabase.from('telephony_logs').insert({ call_sid, caller_number, transcript: text, is_spam: true, threat_score: threatData.risk_score, ... })`
  - `return new Response(JSON.stringify({ success: false, reason: "threat_blocked" }))` (and do not run the rest of VIP handling, LLM proxy, etc.).

Task 2: DLQ Exhaustion Notification Stream
- In `supabase/functions/dead_letter_jobs/index.ts`.
- When a job exceeds `max_retries`:
  - `await supabase.from('telemetry_events').insert({...})` with payload `{"event_type": "dlq.job_exhausted", "job_id": job.id, "payload_type": job.task_type, "error": job.error_log, "timestamp": new Date().toISOString()}` to trigger `proc_notify_telemetry_breach` via the DB trigger.
  - Since the prompt says "Execute NOTIFY telemetry_events with payload: {...}", I will just create a quick migration file `20271201000000_notify_rpc.sql` that defines `CREATE OR REPLACE FUNCTION notify_event(channel text, payload text) RETURNS void AS $$ BEGIN PERFORM pg_notify(channel, payload); END; $$ LANGUAGE plpgsql;` and then `await supabase.rpc('notify_event', { channel: 'telemetry_events', payload: JSON.stringify({...}) })`. Alternatively, maybe there is a simpler way... actually, since `telemetry_events` is a table that fires `pg_notify` for warnings and errors, I'll insert into it with `severity: 'FATAL'` which automatically does a `pg_notify('telemetry_alert_bus', ...)`. Oh! The prompt explicitly says: `Execute NOTIFY telemetry_events with payload: { "event_type": "dlq.job_exhausted", ... }`. I will just use `supabase.rpc` with a custom RPC function.
  - Wait, I'll check if `NOTIFY` can be called. I'll create `supabase/migrations/20261111000000_rpc_notify.sql` with:
    ```sql
    CREATE OR REPLACE FUNCTION pg_notify_rpc(channel text, payload text) RETURNS void AS $$
    BEGIN
      PERFORM pg_notify(channel, payload);
    END;
    $$ LANGUAGE plpgsql;
    ```
    Then use `await supabase.rpc('pg_notify_rpc', { channel: 'telemetry_events', payload: JSON.stringify(payload) })`.

Task 3: Vector RAG Knowledge Base Ingestion
- Update `supabase/functions/knowledge-ingest/index.ts`.
- Update chunk length to max 2000 chars (approx 500 tokens).
- Use local `generate-embedding` endpoint instead of direct OpenAI call.
- Use `{ title, content, category, tags, source_app }` input.
- Insert into `executive_knowledge_base`.
