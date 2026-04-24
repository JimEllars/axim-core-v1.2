import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch all vault records
    const { data: vaultRecords, error: vaultError } = await supabaseAdmin
      .from('vault_records')
      .select('id, file_name, trace_id, created_at');

    if (vaultError) throw new Error(`Vault query error: ${vaultError.message}`);

    // Check if there are any records
    if (!vaultRecords || vaultRecords.length === 0) {
        return new Response(JSON.stringify({ message: "No vault records found" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch successful transaction sessions
    const { data: transactions, error: transactionError } = await supabaseAdmin
      .from('micro_app_transactions')
      .select('session_id');

    if (transactionError) throw new Error(`Transaction query error: ${transactionError.message}`);

    const paidSessions = new Set(transactions?.map(t => t.session_id) || []);

    let leakCount = 0;
    const leaks = [];

    // Compare and find missing payments (trace_id maps to session_id for this logic)
    for (const record of vaultRecords) {
        if (!record.trace_id) continue;

        // A trace_id is usually a Stripe session_id or internally generated ID.
        // If it's a generated document, it should map to a checkout session.
        if (!paidSessions.has(record.trace_id)) {
            leakCount++;
            leaks.push(record);

            // Insert CRITICAL revenue_leak telemetry event
            await supabaseAdmin.from('telemetry_logs').insert({
                event: 'revenue_leak',
                severity: 'CRITICAL',
                app_type: 'financial-audit',
                details: {
                    vault_record_id: record.id,
                    trace_id: record.trace_id,
                    file_name: record.file_name,
                    reason: 'Vault document found without matching completed Stripe session'
                }
            });
        }
    }

    return new Response(JSON.stringify({
        success: true,
        message: `Audit complete. Found ${leakCount} revenue leaks.`,
        leaks: leakCount
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error(`[Financial Audit] Error:`, error);

    // Log the audit failure
    await supabaseAdmin.from('telemetry_logs').insert({
        event: 'audit_failure',
        severity: 'HIGH',
        app_type: 'financial-audit',
        details: { error: error.message }
    });

    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
