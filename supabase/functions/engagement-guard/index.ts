import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    // 1. Check user_engagement_scores for users with health_index < 40
    const { data: atRiskUsers, error: fetchError } = await supabaseAdmin
      .from('user_engagement_scores')
      .select('user_id, email, health_index')
      .lt('health_index', 40);

    if (fetchError) {
      throw new Error(`Failed to fetch engagement scores: ${fetchError.message}`);
    }

    if (!atRiskUsers || atRiskUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No at-risk users found.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tasksCreated = [];

    for (const user of atRiskUsers) {
      // 2. Check if a recent task already exists to prevent spam
      const taskTitle = `Churn Risk Outreach: ${user.email}`;
      const { data: existingTasks, error: taskFetchError } = await supabaseAdmin
        .from('tasks_ax2024')
        .select('id')
        .eq('title', taskTitle)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (taskFetchError) {
        console.error(`Error checking existing tasks for ${user.email}:`, taskFetchError);
        continue;
      }

      if (existingTasks && existingTasks.length > 0) {
        // Task already exists
        continue;
      }

      // 3. Create a new record in the tasks table
      const { error: insertError } = await supabaseAdmin
        .from('tasks_ax2024')
        .insert({
          title: taskTitle,
          description: `User health index dropped to ${user.health_index}. Verify latest telemetry and perform manual outreach.`,
          priority: 'high',
          status: 'pending',
          user_id: user.user_id,
          task_type: 'retention'
        });

      if (insertError) {
        console.error(`Error creating task for ${user.email}:`, insertError);
      } else {
        tasksCreated.push(user.email);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Engagement guard completed. Tasks created for: ${tasksCreated.join(', ')}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Engagement Guard Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
