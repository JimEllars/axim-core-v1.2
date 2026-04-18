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

    // Calculate billing for past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const { data: partners, error: partnersError } = await supabaseAdmin
      .from('partner_credits')
      .select('partner_id, users:partner_id (email)')

    if (partnersError) throw partnersError;

    let processedCount = 0;

    for (const partner of partners) {
      const partnerId = partner.partner_id;
      // We can't join directly to auth.users if not configured with correct privileges
      // Let's assume partner.users.email exists, but fallback if needed.
      let partnerEmail;

      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(partnerId);
      if (userData?.user?.email) {
          partnerEmail = userData.user.email;
      } else {
          continue; // Cannot bill without email
      }

      const { count, error: countError } = await supabaseAdmin
        .from('micro_app_transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgoStr)
        .or(`user_identifier.eq.${partnerId},user_identifier.eq.${partnerEmail}`)

      if (countError) continue;

      if (count && count > 0) {
        // Create Stripe Invoice
        let customers = await stripe.customers.list({ email: partnerEmail, limit: 1 });
        let customerId;

        if (customers.data.length === 0) {
           const newCustomer = await stripe.customers.create({ email: partnerEmail });
           customerId = newCustomer.id;
        } else {
           customerId = customers.data[0].id;
        }

        const unitAmount = 1000; // $10.00

        await stripe.invoiceItems.create({
           customer: customerId,
           amount: count * unitAmount,
           currency: 'usd',
           description: `Usage-based API Consumption for previous 30 days (${count} units)`,
        });

        const invoice = await stripe.invoices.create({
           customer: customerId,
           auto_advance: true,
           collection_method: 'send_invoice',
           days_until_due: 30,
        });

        await stripe.invoices.sendInvoice(invoice.id);

        await supabaseAdmin
            .from('micro_app_transactions')
            .insert({
                user_identifier: partnerId,
                product_id: 'monthly_invoice',
                amount_total: count * unitAmount,
                stripe_session_id: invoice.id
            });

        processedCount++;
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
