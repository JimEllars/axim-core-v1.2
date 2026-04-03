import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.1.0?target=deno';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin')) });
  }

  try {
    const { priceId, returnUrl } = await req.json();

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("User is not authenticated.");
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: customerData } = await supabaseAdmin
        .from('subscriptions_ax2024')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .single();

    let customerId = customerData?.stripe_customer_id;

    if (!customerId) {
        console.log(`Creating new Stripe customer for user ${user.email}`);
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
                user_id: user.id
            }
        });
        customerId = customer.id;
    }

    console.log(`Creating checkout session for customer ${customerId}`);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${returnUrl || 'http://localhost:5173/admin/billing'}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl || 'http://localhost:5173/admin/billing'}`,
      client_reference_id: user.id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
