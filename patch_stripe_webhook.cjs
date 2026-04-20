const fs = require('fs');

let content = fs.readFileSync('supabase/functions/stripe-webhooks/index.ts', 'utf8');

content = content.replace(
  'await recordOneTimePurchase(userId, productId, amountTotal, session.id);',
  `const partnerId = session.metadata?.partner_id;
          const appId = session.metadata?.app_id;
          await recordOneTimePurchase(userId, productId, amountTotal, session.id, partnerId, appId);`
);

content = content.replace(
  'async function recordOneTimePurchase(userId: string, productId: string, amountTotal: number, sessionId: string) {',
  'async function recordOneTimePurchase(userId: string, productId: string, amountTotal: number, sessionId: string, partnerId?: string, appId?: string) {'
);

content = content.replace(
  'stripe_session_id: sessionId,',
  `stripe_session_id: sessionId,
      partner_id: partnerId,
      app_id: appId,`
);

fs.writeFileSync('supabase/functions/stripe-webhooks/index.ts', content, 'utf8');
