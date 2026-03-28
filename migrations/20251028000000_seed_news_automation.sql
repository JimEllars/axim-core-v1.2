-- Seed Data for 4:00 AM EST News Scan and Report in existing scheduled_tasks table
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- We assume admin@example.com is the main system runner for this demo
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@example.com' LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    -- Clean up any existing task with this exact schedule to avoid duplicates on rerun
    DELETE FROM scheduled_tasks
    WHERE schedule = '0 4 * * *'
      AND user_id = admin_user_id
      AND command::jsonb ->> 'type' = 'news_scan_and_report';

    INSERT INTO scheduled_tasks (
      user_id, command, schedule, status
    ) VALUES (
      admin_user_id,
      '{"type": "news_scan_and_report", "timezone": "America/New_York", "config": {"topic": "industry news", "geo": "US"}}'::text,
      '0 4 * * *',
      'active'
    );
  END IF;
END $$;
