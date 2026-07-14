const fs = require('fs');

const files = [
    'supabase/migrations/20250101000000_cron.sql',
    'supabase/migrations/20260420000000_schedule_cognitive_compression.sql',
    'supabase/migrations/20260602000000_onyx_health_cron.sql',
    'supabase/migrations/20260715000000_create_action_required_hitl.sql',
    'supabase/migrations/20260902000000_daily_executive_brief.sql',
    'supabase/migrations/20260904000000_financial_audit_cron.sql',
    'supabase/migrations/20261205000000_onyx_heartbeat.sql',
    'supabase/migrations/20261220000000_podcast_poller_cron.sql',
    'supabase/migrations/20261230000000_social_scraper_cron.sql',
    'supabase/migrations/20270101000000_osint_cron.sql',
    'supabase/migrations/20270201000000_archiver_cron.sql',
    'supabase/migrations/20270901000000_activate_pg_cron.sql',
    'supabase/migrations/20260425000000_create_satellite_job_queue.sql',
    'supabase/migrations/20250607000000_predictive_engagement.sql'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        let sql = fs.readFileSync(file, 'utf8');
        if (!sql.includes('create extension if not exists pg_cron')) {
            sql = 'create extension if not exists pg_cron;\ncreate extension if not exists pg_net;\n\n' + sql;
            fs.writeFileSync(file, sql);
            console.log('Patched ' + file);
        }
    }
}
