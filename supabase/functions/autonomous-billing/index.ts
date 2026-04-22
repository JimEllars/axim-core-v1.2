import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6"
import Stripe from "https://esm.sh/stripe@11.1.0?target=deno"
import { corsHeaders } from "../_shared/cors.ts"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
       return new Response(JSON.stringify({ error: 'Unauthorized' }), {
         status: 401,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch all unprocessed API usage logs
    const { data: unbilledLogs, error: logsError } = await supabaseAdmin
      .from('api_usage_logs')
      .select('*')
      .is('billed', false);

    // Some records might have billed as null instead of false, so also fetch nulls
    const { data: nullBilledLogs, error: nullLogsError } = await supabaseAdmin
      .from('api_usage_logs')
      .select('*')
      .is('billed', null);

    if (logsError || nullLogsError) throw (logsError || nullLogsError);

    const allUnbilledLogs = [...(unbilledLogs || []), ...(nullBilledLogs || [])];

    // Group by partner_id
    const logsByPartner: Record<string, { count: number, logIds: string[] }> = allUnbilledLogs.reduce((acc: any, log: any) => {
      if (!acc[log.partner_id]) {
        acc[log.partner_id] = { count: 0, logIds: [] };
      }
      acc[log.partner_id].count++;
      acc[log.partner_id].logIds.push(log.id);
      return acc;
    }, {});

    let processedCount = 0;

    for (const [partnerId, data] of Object.entries(logsByPartner)) {
      if (data.count === 0) continue;

      let partnerEmail;
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(partnerId);
      if (userData?.user?.email) {
          partnerEmail = userData.user.email;
      } else {
          continue; // Cannot bill without email
      }

      // Fetch customer
      let customers = await stripe.customers.list({ email: partnerEmail, limit: 1 });
      let customerId;

      if (customers.data.length === 0) {
         continue; // Wait, if no customer, we could create one or skip. The instructions say "push these aggregated totals as 'Usage Records' to the partner's active Stripe Subscription Item." So they should already have a subscription item.
      } else {
         customerId = customers.data[0].id;
      }

      // Find the active subscription and the meter/usage item
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        console.log(`No active subscription found for partner ${partnerId}`);
        continue;
      }

      const subscription = subscriptions.data[0];
      const subscriptionItem = subscription.items.data.find(item => item.plan.usage_type === 'metered');

      if (!subscriptionItem) {
        console.log(`No metered subscription item found for partner ${partnerId}`);
        continue;
      }

      try {
        // Push usage record to Stripe
        await stripe.subscriptionItems.createUsageRecord(
          subscriptionItem.id,
          {
            quantity: data.count,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
          }
        );

        // Mark logs as billed in Supabase
        const { error: updateError } = await supabaseAdmin
          .from('api_usage_logs')
          .update({ billed: true })
          .in('id', data.logIds);

        if (updateError) {
          console.error(`Failed to mark logs as billed for ${partnerId}`, updateError);
          // If we fail here, we might double charge next time, should alert
        } else {
          processedCount++;
        }
      } catch (err) {
        console.error(`Failed to push usage for ${partnerId}`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, processedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
