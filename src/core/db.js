import pg from 'pg';

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const ssl = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url) ? false : { rejectUnauthorized: false };
  return new pg.Pool({ connectionString: url, ssl, max: 10 });
}

// Shared by every venture: paying subscribers + funnel events.
export const CORE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS subscribers (
     id                   SERIAL PRIMARY KEY,
     email                TEXT NOT NULL,
     ref                  TEXT,                              -- what they subscribed to (search, template, profile...)
     status               TEXT NOT NULL DEFAULT 'pending',   -- pending | trialing | active | past_due | cancelled
     stripe_customer      TEXT,
     stripe_subscription  TEXT UNIQUE,
     checkout_session     TEXT UNIQUE,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
     activated_at         TIMESTAMPTZ,
     cancelled_at         TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers(status)`,
  `CREATE TABLE IF NOT EXISTS events (
     id          BIGSERIAL PRIMARY KEY,
     type        TEXT NOT NULL,
     ref         TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS events_type_time_idx ON events(type, created_at)`,
];

export async function migrate(pool, extra = []) {
  for (const sql of [...CORE_MIGRATIONS, ...extra]) await pool.query(sql);
}

export async function track(pool, type, ref = null) {
  try {
    await pool.query('INSERT INTO events(type, ref) VALUES ($1, $2)', [type, ref == null ? null : String(ref).slice(0, 200)]);
  } catch (err) {
    console.error('track failed', err.message);
  }
}

/** Standard metrics contract read by the validation agent. `funnel` = event types to count over 7 days. */
export async function metrics(pool, { venture, priceGbp, funnel = [] }) {
  const n = (sql, p = []) => pool.query(sql, p).then((r) => Number(r.rows[0].n));
  const since = `created_at > now() - interval '7 days'`;
  const paid = await n(`SELECT count(*) n FROM subscribers WHERE status = 'active'`);
  const out = {
    venture,
    paid_active: paid,
    trialing: await n(`SELECT count(*) n FROM subscribers WHERE status = 'trialing'`),
    past_due: await n(`SELECT count(*) n FROM subscribers WHERE status = 'past_due'`),
    waitlist: await n(`SELECT count(*) n FROM subscribers WHERE status = 'pending'`),
    mrr_gbp: Number((paid * priceGbp).toFixed(2)),
    new_paid_7d: await n(`SELECT count(*) n FROM events WHERE type = 'paid' AND ${since}`),
    cancelled_7d: await n(`SELECT count(*) n FROM events WHERE type = 'cancelled' AND ${since}`),
    checkouts_started_7d: await n(`SELECT count(*) n FROM events WHERE type = 'checkout_started' AND ${since}`),
  };
  for (const t of funnel) out[`${t}_7d`] = await n(`SELECT count(*) n FROM events WHERE type = $1 AND ${since}`, [t]);
  out.generated_at = new Date().toISOString();
  return out;
}
