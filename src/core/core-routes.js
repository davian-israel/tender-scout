// Routes every venture shares: Stripe webhook, health, metrics, thanks, manage/cancel, fonts.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { handleStripeEvent, billingPortalUrl } from './billing.js';
import { metrics, track } from './db.js';
import { verifyToken } from './tokens.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const sendHtml = (res, body, status = 200) => res.status(status).type('html').send(body);
const FONT_DIR = fileURLToPath(new URL('../../node_modules/', import.meta.url));

/** Must be called BEFORE body parsers (webhook needs the raw body). */
export function mountWebhook(app, { pool, stripe, onEvent }) {
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), wrap(async (req, res) => {
    if (!stripe) return res.status(503).send('stripe not configured');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`signature error: ${err.message}`);
    }
    const subscriberId = await handleStripeEvent(pool, event);
    if (onEvent) await onEvent(event, subscriberId);
    res.json({ received: true });
  }));
}

/**
 * fonts: { 'name.woff2': '@fontsource/<package>/files/<file>.woff2' } served from node_modules
 * views.messagePage(title, html, opts) renders simple pages in the venture's own style.
 */
export function mountCore(app, { pool, stripe, venture, priceGbp, funnel, fonts = {}, views, describe = (s) => s.ref }) {
  app.get('/healthz', wrap(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, venture, stripe: Boolean(stripe) });
  }));

  app.get('/api/metrics', wrap(async (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (!token || req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
    res.json(await metrics(pool, { venture, priceGbp, funnel }));
  }));

  app.get('/fonts/:file', (req, res) => {
    const rel = fonts[req.params.file];
    if (!rel) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(FONT_DIR + rel);
  });

  app.get('/manage/:token', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT * FROM subscribers WHERE id = $1', [id]) : { rows: [] };
    const sub = rows[0];
    if (!sub) return sendHtml(res, views.messagePage('This link does not work', '<p>Open the newest email from us and use the manage link there.</p>'), 404);
    const live = ['active', 'trialing', 'past_due'].includes(sub.status);
    const t = esc(req.params.token);
    const portal = stripe && sub.stripe_customer
      ? `<form method="post" action="/manage/${t}/billing" style="margin-bottom:12px"><button class="btn">Update card or see invoices</button></form>` : '';
    const warn = sub.status === 'past_due' ? '<p><b>Your last payment did not go through.</b> Update your card to keep your subscription.</p>' : '';
    const body = live
      ? `${warn}<p>Your subscription for <b>${esc(describe(sub))}</b> sends to ${esc(sub.email)}.</p>${portal}
         <form method="post" action="/manage/${t}/cancel"><button class="btn">Cancel subscription</button></form>`
      : `<p>Your subscription for <b>${esc(describe(sub))}</b> is ${esc(sub.status)}.</p>`;
    sendHtml(res, views.messagePage('Manage your subscription', body, { action: '' }));
  }));

  app.post('/manage/:token/billing', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT stripe_customer FROM subscribers WHERE id = $1', [id]) : { rows: [] };
    if (!stripe || !rows[0]?.stripe_customer) return res.redirect(303, `/manage/${encodeURIComponent(req.params.token)}`);
    const base = `${req.protocol}://${req.get('host')}`;
    res.redirect(303, await billingPortalUrl(stripe, rows[0].stripe_customer, `${base}/manage/${encodeURIComponent(req.params.token)}`));
  }));

  app.post('/manage/:token/cancel', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT * FROM subscribers WHERE id = $1', [id]) : { rows: [] };
    const sub = rows[0];
    if (!sub) return res.status(404).send('not found');
    if (stripe && sub.stripe_subscription) await stripe.subscriptions.cancel(sub.stripe_subscription);
    const upd = await pool.query(`UPDATE subscribers SET status='cancelled', cancelled_at=now() WHERE id=$1 AND status<>'cancelled'`, [id]);
    if (upd.rowCount) await track(pool, 'cancelled', id);
    sendHtml(res, views.messagePage('Subscription cancelled', '<p>You will not be charged again. Your data is kept for 30 days, then deleted.</p>'));
  }));
}

export function mountErrors(app, views) {
  app.use((_req, res) => sendHtml(res, views.messagePage('Page not found', '<p>That page does not exist.</p>'), 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    sendHtml(res, views.messagePage('Something went wrong', '<p>Try again in a minute. If it keeps happening, reply to any of our emails.</p>'), 500);
  });
}

export function baseUrlFromEnv(port) {
  return (process.env.BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`)).replace(/\/$/, '');
}
