import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.1.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') as string,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
);

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(err.message, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription') {
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        const userId = session.client_reference_id; // Ensure this is passed during checkout creation

        if (userId) {
             const subscription = await stripe.subscriptions.retrieve(subscriptionId);
             await upsertSubscription(userId, customerId, subscription);
        } else {
             console.warn(`Checkout session ${session.id} completed without client_reference_id (userId).`);
        }

      } else if (session.mode === 'payment') {
        const userId = session.client_reference_id || session.customer_details?.email;
        const productId = session.metadata?.product_id;
        const amountTotal = session.amount_total;
        const customerEmail = session.customer_details?.email;

        if (userId && productId) {
          const partnerId = session.metadata?.partner_id;
          const appId = session.metadata?.app_id;
          await recordOneTimePurchase(userId, productId, amountTotal, session.id, partnerId, appId);

          if (customerEmail) {
            try {
              await fulfillDigitalProduct(productId, customerEmail, session.id);
            } catch (err: any) {
              console.error(`Fulfillment error: ${err.message}`);
              await supabase.from('telemetry_logs').insert({
                event: 'integration_failure',
                app_type: 'stripe-webhooks',
                status_code: 500,
                timestamp: new Date().toISOString(),
                details: {
                  error: err.message,
                  product_id: productId,
                  session_id: session.id,
                },
              });
            }
          }
        } else {
          console.warn(`Payment session ${session.id} missing userId or product_id metadata.`);
        }
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      // We need to find the user associated with this subscription.
      // Assuming we already stored the customer_id -> user_id mapping, or we query by subscription_id.
      // But for update, we can query by stripe_subscription_id.
      await updateSubscription(subscription);
      break;
    }
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});

async function upsertSubscription(userId: string, customerId: string, subscription: any) {
  if (!userId) {
    console.error('Error: upsertSubscription called without userId');
    return;
  }

  // LIMITATION: Currently assuming one active subscription per user.
  // We use user_id as the conflict target. If multiple subscriptions are supported in the future,
  // this schema and logic must be updated to use 'subscription_id' or a composite key.
  console.log(`Upserting subscription for user ${userId}. Note: enforcing single subscription per user.`);

  const { error } = await supabase
    .from('subscriptions_ax2024')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan_id: subscription.items.data[0].price.id,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }); // Assuming one sub per user for now, or use subscription_id as key

  if (error) {
    console.error('Error upserting subscription:', error);
  } else {
    console.log(`Subscription upserted successfully for user ${userId}`);
  }
}

async function updateSubscription(subscription: any) {
    // Determine userId from metadata if possible, or query by subscription_id
    // But since we upsert based on user_id primarily in the checkout flow, updating by sub id is tricky if we don't know the user.
    // However, if we upsert based on 'stripe_subscription_id' which should be unique.

    // Let's try to update based on stripe_subscription_id.
    // Since RLS policies might prevent service role from arbitrary updates? No, service role bypasses RLS.
    console.log(`Updating subscription ${subscription.id} to status: ${subscription.status}`);

    const { data, error } = await supabase
        .from('subscriptions_ax2024')
        .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)
        .select();

    if (error) {
        console.error('Error updating subscription:', error);
    } else if (data.length === 0) {
        console.warn(`Subscription ${subscription.id} not found for update. This might be a race condition or the initial subscription record was not created.`);
    } else {
        console.log(`Subscription updated successfully: ${subscription.id}`);
    }
}

async function recordOneTimePurchase(userId: string, productId: string, amountTotal: number, sessionId: string, partnerId?: string, appId?: string) {
  console.log(`Recording one-time purchase: User ${userId}, Product ${productId}`);

  const { error } = await supabase
    .from('micro_app_transactions')
    .insert({
      user_identifier: userId,
      product_id: productId,
      amount_total: amountTotal,
      stripe_session_id: sessionId,
      partner_id: partnerId,
      app_id: appId,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error recording one-time purchase:', error);
  } else {
    console.log(`Successfully recorded one-time purchase for user ${userId}`);
  }
}

async function fulfillDigitalProduct(productId: string, customerEmail: string, sessionId: string) {
  console.log(`Fulfilling digital product ${productId} for ${customerEmail}`);

  // Verify product exists
  const { data: product, error: productError } = await supabase
    .from('digital_products')
    .select('*')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    throw new Error(`Product ${productId} not found`);
  }

  // Insert delivery record
  const { error: deliveryError } = await supabase
    .from('product_deliveries')
    .insert({
      product_id: productId,
      customer_email: customerEmail,
      stripe_session_id: sessionId,
      delivery_status: 'delivered',
    });

  if (deliveryError) {
    throw new Error(`Failed to create delivery record: ${deliveryError.message}`);
  }

  // Dispatch email via universal-dispatcher
  const internalKey = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') || 'fallback_internal_key';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const dispatcherUrl = `${supabaseUrl}/functions/v1/universal-dispatcher`;

  const dispatchRes = await fetch(dispatcherUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Axim-Internal-Service-Key': internalKey,
    },
    body: JSON.stringify({
      target_service: 'email',
      action_type: 'send_email',
      payload: {
        to: customerEmail,
        subject: `Your product: ${product.name}`,
        text: `Thank you for your purchase. Here is your secure product link: ${product.download_url}`,
        recipient: customerEmail,
      },
    }),
  });

  if (!dispatchRes.ok) {
    throw new Error(`Failed to dispatch email: ${await dispatchRes.text()}`);
  }
  console.log(`Successfully dispatched email for ${productId}`);
}
