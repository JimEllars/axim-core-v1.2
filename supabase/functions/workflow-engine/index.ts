import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';

serve(async (req) => {
    try {
        const authHeader = req.headers.get('Authorization');
        const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') as string,
            expectedKey
        );

        // Fetch tasks that are active and due to run
        const now = new Date().toISOString();
        const { data: tasks, error: fetchError } = await supabaseAdmin
            .from('scheduled_tasks')
            .select('*')
            .eq('status', 'active')
            .lte('next_run_at', now)
            .limit(50);

        if (fetchError) {
            throw new Error(`Failed to fetch scheduled tasks: ${fetchError.message}`);
        }

        if (!tasks || tasks.length === 0) {
            return new Response(JSON.stringify({ message: 'No tasks due.' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const results = [];
        for (const task of tasks) {
            try {
                // Execute the command using the universal dispatcher or directly enqueue it
                // We'll queue it to satellite_job_queue
                const { error: jobError } = await supabaseAdmin
                    .from('satellite_job_queue')
                    .insert({
                        app_id: 'workflow-engine',
                        task_type: 'scheduled_task',
                        payload: { command: task.command, user_id: task.user_id },
                        status: 'pending'
                    });

                if (jobError) throw jobError;

                // Update the task's last_run_at and next_run_at
                // Very simple next_run_at calculation for demonstration
                const nextRunAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour, should parse cron properly in real impl

                await supabaseAdmin
                    .from('scheduled_tasks')
                    .update({ last_run_at: now, next_run_at: nextRunAt })
                    .eq('id', task.id);

                results.push({ id: task.id, status: 'queued' });
            } catch (err: any) {
                console.error(`Failed to process task ${task.id}:`, err);
                results.push({ id: task.id, status: 'error', error: err.message });
            }
        }

        return new Response(JSON.stringify({
            message: 'Workflow engine execution completed.',
            results
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Workflow engine Fatal Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});
