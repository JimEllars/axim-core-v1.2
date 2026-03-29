-- Seed Data for 11:59 PM Nightly Memory Summary in existing scheduled_tasks table
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- We assume admin@example.com is the main system runner for this demo
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@example.com' LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    -- Clean up any existing task with this exact schedule to avoid duplicates on rerun
    DELETE FROM scheduled_tasks
    WHERE schedule = '59 23 * * *'
      AND user_id = admin_user_id
      AND command::jsonb ->> 'type' = 'memory_summary';

    INSERT INTO scheduled_tasks (
      user_id, command, schedule, status
    ) VALUES (
      admin_user_id,
      json_build_object(
        'type', 'memory_summary',
        'timezone', 'America/New_York',
        'config', json_build_object('userId', admin_user_id)
      )::text,
      '59 23 * * *',
      'active'
    );
  END IF;
END $$;
