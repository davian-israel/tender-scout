#!/usr/bin/env node
// Connects this app to Stripe in one step. Run it where the app's variables are set:
//   railway run npm run stripe:setup          (Railway CLI, from this repo's folder)
// It checks the key, then creates (or reuses) the webhook endpoint for BASE_URL/webhooks/stripe
// with the events the app needs, and prints the signing secret to put in STRIPE_WEBHOOK_SECRET.
import Stripe from 'stripe';
import { WEBHOOK_EVENTS } from '../src/core/billing.js';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY is not set. Add it in Railway → web → Variables first.'); process.exit(1); }
const base = (process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`) || '').replace(/\/$/, '');
if (!base.startsWith('https://')) { console.error('Set BASE_URL (or run via `railway run`) so the webhook URL is known.'); process.exit(1); }

const stripe = new Stripe(key);
const mode = key.startsWith('sk_live_') ? 'LIVE' : key.startsWith('sk_test_') ? 'TEST' : key.startsWith('rk_') ? 'RESTRICTED' : 'UNKNOWN';
const account = await stripe.accounts.retrieve();
console.log(`Stripe account ${account.id} (${account.settings?.dashboard?.display_name || account.business_profile?.name || 'no name'}), ${mode} mode`);
if (mode === 'LIVE' && !account.charges_enabled) console.warn('Warning: live charges are not enabled yet. Finish account activation in the Stripe dashboard.');

const url = `${base}/webhooks/stripe`;
const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((w) => w.url === url);
if (existing) {
  const missing = WEBHOOK_EVENTS.filter((e) => !existing.enabled_events.includes(e) && !existing.enabled_events.includes('*'));
  if (missing.length) await stripe.webhookEndpoints.update(existing.id, { enabled_events: [...new Set([...existing.enabled_events, ...missing])] });
  console.log(`Webhook already exists: ${url} (${existing.id})${missing.length ? `, added ${missing.join(', ')}` : ''}.`);
  console.log('Its signing secret is shown only in the Stripe dashboard (Developers → Webhooks → this endpoint → Reveal).');
} else {
  const ep = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: `${process.env.APP_NAME || 'app'} subscriptions` });
  console.log(`Created webhook ${ep.id} for ${url}`);
  console.log(`\nSet this in Railway → web → Variables:\n  STRIPE_WEBHOOK_SECRET=${ep.secret}\n`);
}
console.log('Also enable the customer portal once per Stripe account: Settings → Billing → Customer portal → Activate.');
