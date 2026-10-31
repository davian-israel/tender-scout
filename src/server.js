import cron from 'node-cron';
import { createPool, migrate } from './core/db.js';
import { createStripe } from './core/billing.js';
import { baseUrlFromEnv } from './core/core-routes.js';
import { sendEmail } from './core/email.js';
import { signId } from './core/tokens.js';
import { createApp } from './app.js';
import { MIGRATIONS, ingest, seedSample } from './ocds.js';
import { matchesFor } from './matcher.js';
import { digestEmail } from './views.js';

const port = Number(process.env.PORT || 3000);
const baseUrl = baseUrlFromEnv(port);
const pool = createPool();
await migrate(pool, MIGRATIONS);
await seedSample(pool);
const stripe = createStripe();

createApp({ pool, stripe, baseUrl }).listen(port, () => console.log(`tender-scout on ${port} base=${baseUrl} stripe=${Boolean(stripe)}`));

export async function sendDigests() {
  const { rows } = await pool.query(`SELECT s.id sid, s.email, d.last_sent, p.* FROM subscribers s JOIN profiles p ON p.token = s.ref
    LEFT JOIN digests_sent d ON d.subscriber_id = s.id WHERE s.status IN ('active','trialing')`);
  for (const r of rows) {
    try {
      const matches = await matchesFor(pool, r, { since: r.last_sent || new Date(Date.now() - 864e5), limit: 15 });
      if (!matches.length) continue;
      await sendEmail({ to: r.email, ...digestEmail({ matches, manageUrl: `${baseUrl}/manage/${signId(r.sid)}`, matchesUrl: `${baseUrl}/matches/${r.token}` }) });
      await pool.query(`INSERT INTO digests_sent(subscriber_id, last_sent) VALUES ($1, now()) ON CONFLICT (subscriber_id) DO UPDATE SET last_sent = now()`, [r.sid]);
    } catch (e) { console.error('[digest]', r.sid, e.message); }
  }
}

const runIngest = () => ingest(pool).catch((e) => console.error('ingest failed', e));
cron.schedule('0 6 * * 1-5', runIngest, { timezone: 'Europe/London' });
cron.schedule('30 7 * * 1-5', () => sendDigests().catch((e) => console.error(e)), { timezone: 'Europe/London' });
// First run in production pulls 30 days so new visitors see matches immediately.
if (process.env.NODE_ENV === 'production') setTimeout(() => ingest(pool, { from: new Date(Date.now() - 30 * 864e5) }).catch(console.error), 20000);
