// Ingest UK public contract notices (OCDS) from Contracts Finder and Find a Tender.
// Parsing is defensive: OCDS publishers fill different fields.

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS notices (
     ocid TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, description TEXT, buyer TEXT,
     value_gbp NUMERIC, deadline TIMESTAMPTZ, published_at TIMESTAMPTZ, region TEXT, cpv TEXT[], url TEXT,
     summary TEXT, ingested_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS notices_published_idx ON notices(published_at DESC)`,
  `CREATE TABLE IF NOT EXISTS profiles (
     id SERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL, description TEXT NOT NULL, region TEXT,
     min_value NUMERIC, email TEXT, subscriber_id INT REFERENCES subscribers(id), threshold INT NOT NULL DEFAULT 25,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS feedback (profile_id INT REFERENCES profiles(id) ON DELETE CASCADE, ocid TEXT, relevant BOOLEAN, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (profile_id, ocid))`,
  `CREATE TABLE IF NOT EXISTS digests_sent (subscriber_id INT PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE, last_sent TIMESTAMPTZ NOT NULL)`,
];

const iso = (d) => d.toISOString().slice(0, 19);

export const SOURCES = {
  'contracts-finder': (from) => `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=${iso(from)}&stages=tender&limit=100`,
  'find-a-tender': (from) => `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=${iso(from)}&stages=tender&limit=100`,
};

export function parseRelease(r, source) {
  const t = r.tender || {};
  const buyerParty = (r.parties || []).find((p) => (p.roles || []).includes('buyer'));
  const region = t.deliveryAddresses?.[0]?.region || buyerParty?.address?.region || buyerParty?.address?.locality || null;
  const cpv = [...new Set([t.classification, ...(t.items || []).map((i) => i.classification)].filter(Boolean).map((c) => c.id).filter(Boolean))];
  const value = t.value?.amount ?? t.minValue?.amount ?? null;
  const url = (t.documents || []).find((d) => /notice/i.test(d.documentType || ''))?.url
    || (source === 'contracts-finder' ? `https://www.contractsfinder.service.gov.uk/notice/${encodeURIComponent((r.id || '').split('-').slice(0, 5).join('-'))}` : `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.id || '')}`);
  if (!r.ocid || !t.title) return null;
  return {
    ocid: r.ocid, source, title: String(t.title).trim(), description: (t.description || '').trim().slice(0, 6000),
    buyer: r.buyer?.name || buyerParty?.name || null, value_gbp: value, deadline: t.tenderPeriod?.endDate || null,
    published_at: r.date || null, region, cpv, url,
  };
}

export async function ingest(pool, { from = new Date(Date.now() - 2 * 864e5), fetchImpl = fetch, maxPages = 20 } = {}) {
  const stats = {};
  for (const [source, build] of Object.entries(SOURCES)) {
    let url = build(from), pages = 0, n = 0;
    try {
      while (url && pages < maxPages) {
        const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`${source} ${res.status}`);
        const body = await res.json();
        for (const rel of body.releases || []) {
          const nt = parseRelease(rel, source);
          if (!nt) continue;
          await pool.query(
            `INSERT INTO notices(ocid, source, title, description, buyer, value_gbp, deadline, published_at, region, cpv, url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (ocid) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, deadline=EXCLUDED.deadline, value_gbp=EXCLUDED.value_gbp`,
            [nt.ocid, nt.source, nt.title, nt.description, nt.buyer, nt.value_gbp, nt.deadline, nt.published_at, nt.region, nt.cpv, nt.url],
          );
          n++;
        }
        url = body.links?.next || null;
        pages++;
      }
      stats[source] = n;
    } catch (err) {
      stats[source] = `error: ${err.message}`;
      console.error('[ingest]', source, err.message);
    }
  }
  console.log('[ingest]', JSON.stringify(stats));
  return stats;
}

/** Development only: sample notices so the UI can be built offline. Never runs in production. */
export async function seedSample(pool) {
  if (process.env.NODE_ENV === 'production') return;
  const { rows } = await pool.query('SELECT count(*)::int n FROM notices');
  if (rows[0].n) return;
  const d = (days) => new Date(Date.now() + days * 864e5).toISOString();
  const sample = [
    ['Office cleaning services for council depots', 'Daily cleaning of three council depots including washrooms, kitchens and offices. Contractors must hold public liability insurance of £5m.', 'Example Borough Council', 85000, 21, 'South East'],
    ['Website redesign and hosting for a museum trust', 'Redesign of the public website, accessibility to WCAG 2.2 AA, content migration and three years of hosting and support.', 'Sample Museums Trust', 60000, 14, 'London'],
    ['Grounds maintenance at secondary schools', 'Grass cutting, hedge trimming and winter gritting at five secondary schools for two years with an option to extend.', 'Demo Academy Trust', 120000, 30, 'North West'],
    ['Catering for staff canteen', 'Breakfast and lunch service for roughly 250 staff, five days a week, including dietary requirements.', 'Example NHS Foundation Trust', 240000, 25, 'Yorkshire and the Humber'],
    ['IT support and Microsoft 365 administration', 'Remote and on-site IT support for 40 users, Microsoft 365 administration, device management and cyber security monitoring.', 'Sample Parish Council', 30000, 9, 'East of England'],
    ['Commercial deep cleaning after refurbishment', 'One-off deep clean of two floors after refurbishment, including window cleaning and waste removal.', 'Demo Housing Association', 12000, 6, 'South East'],
  ];
  for (const [i, [title, description, buyer, value, days, region]] of sample.entries()) {
    await pool.query(`INSERT INTO notices(ocid, source, title, description, buyer, value_gbp, deadline, published_at, region, cpv, url)
      VALUES ($1,'sample',$2,$3,$4,$5,$6,now() - ($7 || ' days')::interval,$8,'{}','https://example.com') ON CONFLICT DO NOTHING`,
    [`ocds-sample-${i}`, title, description, buyer, value, d(days), String(i), region]);
  }
}
