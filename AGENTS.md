# Agent runbook — Tender Scout

## Pipeline (weekdays)
- 06:00 UK `ingest` pulls new tender-stage notices from Contracts Finder and Find a Tender (OCDS). Check the log line `[ingest]` shows numbers, not errors.
- 07:30 UK digests go to active and trialing subscribers whose profile matched new notices.
## Quality (weekly)
- Sample 10 matches across profiles; report how many a human would call relevant. Tune `src/matcher.js` (stopwords, weights) with tests.
- Hidden ("not relevant") rate per profile is a signal; above 50% means matching is too loose.
## Summaries
- MVP uses the first two sentences of the notice. If ANTHROPIC_API_KEY is added later, summarise once per notice (never per user) and keep spend under £3/day.
- Summaries must never change values, dates or eligibility rules.
## Hard limits
No spending, no new accounts, no cold outreach to buyers or suppliers, no pricing/legal changes without Davian.
