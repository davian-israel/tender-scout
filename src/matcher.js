// Lightweight relevance scoring: weighted keyword overlap between a business description and a notice.
// No external AI needed; deterministic and cheap. Unit-tested.

const STOP = new Set(('a about above after again all also an and any are as at be been being but by can could do does for from had has have he her his how i if in into is it its '
  + 'me more most my no not of on once only or other our out over own same she should so some such than that the their them then there these they this those '
  + 'through to too under until up very was we were what when where which while who will with would you your provide provision services service supply contract '
  + 'tender framework including include requirement requirements required lot lots council trust ltd limited company business work works').split(' '));

const STEM = (w) => (w.length > 4 ? w.replace(/ings?$/, '').replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w);
export function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(STEM);
}

/**
 * Score 0–100. Title matches count double. Returns the shared terms as the reason.
 */
export function score(profileText, notice) {
  const want = new Set(tokens(profileText));
  if (!want.size) return { score: 0, terms: [] };
  const title = tokens(notice.title), body = tokens(notice.description);
  const hits = new Map();
  for (const w of title) if (want.has(w)) hits.set(w, (hits.get(w) || 0) + 2);
  for (const w of body) if (want.has(w)) hits.set(w, (hits.get(w) || 0) + 1);
  const distinct = hits.size;
  const weight = [...hits.values()].reduce((a, b) => a + Math.min(b, 4), 0);
  const raw = 100 * (0.6 * Math.min(1, distinct / Math.min(want.size, 5)) + 0.4 * Math.min(1, weight / 10));
  const terms = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  return { score: Math.round(raw), terms };
}

export function passesFilters(profile, notice, now = new Date()) {
  if (!notice.deadline) return false; // no closing date = usually an award or notice we cannot act on
  if (notice.deadline && new Date(notice.deadline) < now) return false;
  if (profile.min_value && notice.value_gbp != null && Number(notice.value_gbp) < Number(profile.min_value)) return false;
  if (profile.region && profile.region !== 'Anywhere in the UK' && notice.region
    && !String(notice.region).toLowerCase().includes(profile.region.toLowerCase())) return false;
  return true;
}

export async function matchesFor(pool, profile, { sinceDays = 30, since = null, limit = 30 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM notices WHERE published_at > ${since ? '$1' : `now() - interval '${Number(sinceDays)} days'`} ORDER BY published_at DESC LIMIT 2000`,
    since ? [since] : []);
  const { rows: fb } = await pool.query('SELECT ocid FROM feedback WHERE profile_id = $1 AND relevant = false', [profile.id || 0]);
  const hidden = new Set(fb.map((f) => f.ocid));
  return rows.filter((n) => !hidden.has(n.ocid) && passesFilters(profile, n))
    .map((n) => ({ ...n, ...score(profile.description, n) }))
    .filter((n) => n.score >= (profile.threshold ?? 25))
    .sort((a, b) => b.score - a.score || new Date(a.deadline || 0) - new Date(b.deadline || 0))
    .slice(0, limit);
}

/** Plain summary without AI: first two sentences of the description, max 320 chars. */
export function extractiveSummary(desc) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  const two = (s.match(/[^.!?]+[.!?]+/g) || [s]).slice(0, 2).map((x) => x.trim()).join(' ');
  return two.length > 320 ? `${two.slice(0, 317)}...` : two;
}
