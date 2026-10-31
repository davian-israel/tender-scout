# Tender Scout
Public-contract alerts for UK micro-businesses. Describe your business → instant free matches from the last 30 days →
£29/month weekday alerts after a 14-day trial. Data: Contracts Finder + Find a Tender OCDS APIs. Shared core in `src/core`.
Run `DATABASE_URL=... npm start` (dev seeds sample notices; production never does) · `npm test` · `GET /api/metrics`.
Env: DATABASE_URL, NODE_ENV=production, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, APP_SECRET, METRICS_TOKEN, PRICE_GBP=29, TRIAL_DAYS=14.
