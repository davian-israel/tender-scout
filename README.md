# Tender Scout
Public-contract alerts for UK micro-businesses. Describe your business → instant free matches from the last 30 days →
£29/month weekday alerts after a 14-day trial. Data: Contracts Finder + Find a Tender OCDS APIs. Shared core in `src/core`.
Run `DATABASE_URL=... npm start` (dev seeds sample notices; production never does) · `npm test` · `GET /api/metrics`.
Env: DATABASE_URL, NODE_ENV=production, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, APP_SECRET, METRICS_TOKEN, PRICE_GBP=29, TRIAL_DAYS=14.

## Connect Stripe
1. In Railway → this project → web → Variables, add `STRIPE_SECRET_KEY` (start with `sk_test_…`).
2. From this repo folder: `railway link` (pick this project), then `railway run npm run stripe:setup`.
   It checks the key, creates the webhook at `<site>/webhooks/stripe` for
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`,
   and prints `STRIPE_WEBHOOK_SECRET=whsec_…` — add that variable too. Railway redeploys.
3. Stripe dashboard → Settings → Billing → Customer portal → Activate (once per Stripe account).
4. Test with card 4242 4242 4242 4242, then swap both keys for live ones and run step 2 again.
