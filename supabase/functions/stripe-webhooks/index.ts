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
    console.error(`Webhook signature verification failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    return new Response(err instanceof Error ? err.message : "Unknown error", { status: 400 });
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
        const appId = session.metadata?.app_id;

        if (userId && productId) {
          const partnerId = session.metadata?.partner_id;
          await recordOneTimePurchase(userId, productId, amountTotal, session.id, partnerId, appId);

          if (customerEmail) {
            try {
              await fulfillDigitalProduct(productId, customerEmail, session.id, appId, userId);
            } catch (err: any) {
              console.error(`Fulfillment error: ${err instanceof Error ? err.message : "Unknown error"}`);
              await supabase.from('telemetry_logs').insert({
                event: 'integration_failure',
                app_type: appId || 'stripe-webhooks',
                timestamp: new Date().toISOString(),
                details: {
                  error: err instanceof Error ? err.message : "Unknown error",
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
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error upserting subscription:', error);
  } else {
    console.log(`Subscription upserted successfully for user ${userId}`);
  }
}

async function updateSubscription(subscription: any) {
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

async function fulfillDigitalProduct(productId: string, customerEmail: string, sessionId: string, appId?: string, userId?: string) {
  console.log(`Fulfilling digital product ${productId} for ${customerEmail} via app ${appId}`);

  // Insert delivery record
  const { error: deliveryError } = await supabase
    .from('product_deliveries')
    .insert({
      product_id: productId,
      customer_email: customerEmail,
      stripe_session_id: sessionId,
      delivery_status: 'processing',
    });

  if (deliveryError) {
    throw new Error(`Failed to create delivery record: ${deliveryError.message}`);
  }

  const internalKey = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') || 'fallback_internal_key';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  let artifactUrl = '';

  if (appId) {
     // Internal fulfillment orchestration
     console.log(`Triggering satellite app ${appId} for artifact generation...`);
     const appUrl = `${supabaseUrl}/functions/v1/${appId}`;
     const appRes = await fetch(appUrl, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'X-Axim-Internal-Service-Key': internalKey,
       },
       body: JSON.stringify({
         action: 'generate_artifact',
         session_id: sessionId,
         user_id: userId,
         customer_email: customerEmail,
         product_id: productId
       })
     });

     if (!appRes.ok) {
       throw new Error(`Satellite app ${appId} failed generation: ${await appRes.text()}`);
     }

     const appData = await appRes.json();
     const artifactPdfBase64 = appData.artifact;

     if (artifactPdfBase64) {
       // Secure artifact storage
       const fileName = `${appId}_${sessionId}.pdf`;
       const pdfBuffer = Uint8Array.from(atob(artifactPdfBase64), c => c.charCodeAt(0));

       const { data: uploadData, error: uploadError } = await supabase.storage
          .from('secure_artifacts')
          .upload(fileName, pdfBuffer, {
             contentType: 'application/pdf',
             upsert: true
          });

       if (uploadError) {
         throw new Error(`Failed to store artifact: ${uploadError.message}`);
       }

       // Generate signed url for delivery
       const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('secure_artifacts')
          .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days valid

       if (signedUrlError) {
          throw new Error(`Failed to generate signed url: ${signedUrlError.message}`);
       }

       artifactUrl = signedUrlData.signedUrl;

       // Record in vault_records
       await supabase.from('vault_records').insert({
          file_name: fileName,
          document_type: appId,
          trace_id: sessionId,
          bucket_id: 'secure_artifacts'
       });
     }
  }

  // Update delivery record to delivered
  await supabase
    .from('product_deliveries')
    .update({ delivery_status: 'delivered' })
    .eq('stripe_session_id', sessionId);

  // Dispatch email via universal-dispatcher
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
        subject: `Your Secure Document Delivery`,
        text: `Thank you for your purchase. ${artifactUrl ? `Here is your secure document link (valid for 7 days): ${artifactUrl}` : 'Your product is ready.'}`,
        recipient: customerEmail,
      },
    }),
  });

  if (!dispatchRes.ok) {
    throw new Error(`Failed to dispatch email: ${await dispatchRes.text()}`);
  }
  console.log(`Successfully fulfilled product ${productId} and dispatched email`);
}
