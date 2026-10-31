import crypto from 'node:crypto';
import express from 'express';
import { mountWebhook, mountCore, mountErrors, sendHtml, wrap } from './core/core-routes.js';
import { startCheckout } from './core/billing.js';
import { track } from './core/db.js';
import { matchesFor } from './matcher.js';
import * as views from './views.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const FONTS = {
  'bc-600.woff2': '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
  'bc-800.woff2': '@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2',
  'b-400.woff2': '@fontsource/barlow/files/barlow-latin-400-normal.woff2',
  'b-600.woff2': '@fontsource/barlow/files/barlow-latin-600-normal.woff2',
};

export function createApp({ pool, stripe, baseUrl }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  mountWebhook(app, { pool, stripe, onEvent: async (_e, id) => {
    if (id) await pool.query('UPDATE profiles p SET subscriber_id = s.id, email = s.email FROM subscribers s WHERE s.id = $1 AND p.token = s.ref', [id]);
  } });
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  mountCore(app, { pool, stripe, venture: 'tender-scout', priceGbp: views.PRICE_GBP, fonts: FONTS, views,
    funnel: ['profile_created', 'matches_viewed', 'trial_started', 'feedback'], describe: () => 'Tender Scout alerts' });

  const getProfile = async (token) => (await pool.query('SELECT * FROM profiles WHERE token = $1', [String(token || '')])).rows[0];

  app.get('/', wrap(async (_req, res) => {
    const { rows } = await pool.query(`SELECT count(*)::int n FROM notices WHERE published_at > now() - interval '30 days'`);
    sendHtml(res, views.homePage({ count: rows[0].n }));
  }));

  app.post('/profile', wrap(async (req, res) => {
    const description = String(req.body.description || '').trim().slice(0, 1200);
    if (description.length < 20) return sendHtml(res, views.messagePage('Tell us a little more', '<p>Describe what your business does in at least a sentence or two, so we can find the right contracts.</p>'), 400);
    const region = views.REGIONS.includes(req.body.region) ? req.body.region : 'Anywhere in the UK';
    const minValue = Number(req.body.min_value) || 0;
    const token = crypto.randomBytes(12).toString('base64url');
    await pool.query('INSERT INTO profiles(token, description, region, min_value) VALUES ($1,$2,$3,$4)', [token, description, region, minValue]);
    await track(pool, 'profile_created', region);
    res.redirect(303, `/matches/${token}`);
  }));

  app.get('/matches/:token', wrap(async (req, res) => {
    const profile = await getProfile(req.params.token);
    if (!profile) return sendHtml(res, views.messagePage('We could not find those matches', '<p>Describe your business again to see fresh matches.</p>'), 404);
    await track(pool, 'matches_viewed', profile.id);
    const flash = req.query.cancelled ? 'Checkout cancelled. You have not been charged.' : null;
    sendHtml(res, views.matchesPage({ profile, matches: await matchesFor(pool, profile), stripeReady: Boolean(stripe), flash }));
  }));

  // Edit an existing profile from the matches page form (same token).
  app.post('/feedback', wrap(async (req, res) => {
    const profile = await getProfile(req.body.token);
    if (!profile) return res.redirect('/');
    await pool.query('INSERT INTO feedback(profile_id, ocid, relevant) VALUES ($1,$2,false) ON CONFLICT (profile_id, ocid) DO UPDATE SET relevant=false', [profile.id, String(req.body.ocid)]);
    await track(pool, 'feedback', profile.id);
    res.redirect(303, `/matches/${profile.token}`);
  }));

  app.get('/tenders/:ocid', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM notices WHERE ocid = $1', [req.params.ocid]);
    if (!rows[0]) return sendHtml(res, views.messagePage('Notice not found', '<p>It may have been withdrawn.</p>'), 404);
    sendHtml(res, views.noticePage({ n: rows[0], baseUrl }));
  }));

  app.post('/subscribe', wrap(async (req, res) => {
    const profile = await getProfile(req.body.token);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!profile || !EMAIL_RE.test(email)) return sendHtml(res, views.messagePage('Check your email address', '<p>Enter a valid email address.</p>'), 400);
    await pool.query('UPDATE profiles SET email = $1 WHERE id = $2', [email, profile.id]);
    const { url } = await startCheckout({ pool, stripe, baseUrl }, { email, ref: profile.token, productName: 'Tender Scout alerts',
      priceGbp: views.PRICE_GBP, trialDays: views.TRIAL_DAYS, cancelPath: `/matches/${profile.token}` });
    res.redirect(303, url);
  }));

  app.get('/pricing', (_req, res) => sendHtml(res, views.pricingPage()));
  app.get('/thanks', (req, res) => sendHtml(res, req.query.pending
    ? views.messagePage('You are on the list', '<p>Alerts open soon, so you have not been charged. We will email you when they start.</p>')
    : views.messagePage('Your free trial has started', `<p>Your first email arrives tomorrow morning. You will not be charged until the ${views.TRIAL_DAYS}-day trial ends.</p>`)));

  app.get('/sitemap.xml', wrap(async (_req, res) => {
    const { rows } = await pool.query(`SELECT ocid FROM notices WHERE deadline > now() ORDER BY published_at DESC LIMIT 40000`);
    const urls = [`${baseUrl}/`, `${baseUrl}/pricing`, ...rows.map((r) => `${baseUrl}/tenders/${encodeURIComponent(r.ocid)}`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`);
  }));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /manage/\nDisallow: /api/\nDisallow: /matches/\nSitemap: ${baseUrl}/sitemap.xml\n`));
  app.get('/privacy', (_req, res) => sendHtml(res, views.messagePage('Privacy', '<p>We store your business description, area and email only to match and send contract alerts. Payments are handled by Stripe. Ask us to delete your data at any time.</p>')));
  app.get('/terms', (_req, res) => sendHtml(res, views.messagePage('Terms', '<p>Tender Scout summarises public notices to help you find opportunities. Always read the official notice before bidding; we are not responsible for decisions made on our summaries. Cancel any time.</p>')));

  mountErrors(app, views);
  return app;
}
