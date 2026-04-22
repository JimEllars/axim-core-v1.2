const fs = require('fs');

let content = fs.readFileSync('supabase/functions/autonomous-billing/index.ts', 'utf8');

// Requirements:
// - The function must aggregate all unprocessed records in api_usage_logs grouped by partner_id.
// - Utilize the Stripe API to push these aggregated totals as "Usage Records" to the partner's active Stripe Subscription Item.
// - Once successfully pushed, mark the rows in api_usage_logs as billed: true to prevent double-charging.

const oldProcessing = `    // Calculate billing for past 30 days
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
        .or(\`user_identifier.eq.\${partnerId},user_identifier.eq.\${partnerEmail}\`)

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
           description: \`Usage-based API Consumption for previous 30 days (\${count} units)\`,
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
    }`;

const newProcessing = `    // Fetch all unprocessed API usage logs
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
    const logsByPartner = allUnbilledLogs.reduce((acc, log) => {
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
        console.log(\`No active subscription found for partner \${partnerId}\`);
        continue;
      }

      const subscription = subscriptions.data[0];
      const subscriptionItem = subscription.items.data.find(item => item.plan.usage_type === 'metered');

      if (!subscriptionItem) {
        console.log(\`No metered subscription item found for partner \${partnerId}\`);
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
          console.error(\`Failed to mark logs as billed for \${partnerId}\`, updateError);
          // If we fail here, we might double charge next time, should alert
        } else {
          processedCount++;
        }
      } catch (err) {
        console.error(\`Failed to push usage for \${partnerId}\`, err);
      }
    }`;

content = content.replace(oldProcessing, newProcessing);
fs.writeFileSync('supabase/functions/autonomous-billing/index.ts', content);
