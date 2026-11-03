import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, score, passesFilters, extractiveSummary } from '../src/matcher.js';
import { parseRelease } from '../src/ocds.js';

test('tokens drop stopwords and stem plurals', () => {
  assert.deepEqual(tokens('We provide office cleaning services for schools'), ['office', 'clean', 'school']);
});

test('relevant notices score higher than irrelevant ones', () => {
  const profile = 'Commercial cleaning company: office cleaning, deep cleans, window cleaning in Kent';
  const good = score(profile, { title: 'Office cleaning services', description: 'Daily office cleaning and window cleaning.' });
  const bad = score(profile, { title: 'Website redesign', description: 'Accessibility and hosting.' });
  assert.ok(good.score >= 50, String(good.score));
  assert.ok(bad.score < 10, String(bad.score));
  assert.ok(good.terms.includes('clean'));
});

test('filters: past deadline, minimum value, region', () => {
  const now = new Date('2026-11-01');
  assert.equal(passesFilters({}, { deadline: '2026-10-01' }, now), false);
  assert.equal(passesFilters({ min_value: 50000 }, { value_gbp: 12000 }, now), false);
  assert.equal(passesFilters({ region: 'London' }, { region: 'North West' }, now), false);
  assert.equal(passesFilters({ region: 'Anywhere in the UK' }, { region: 'North West', deadline: '2026-12-01' }, now), true);
});

test('OCDS release parsing', () => {
  const n = parseRelease({
    ocid: 'ocds-b5fd17-123', tag: ['tender'], date: '2026-10-30T10:00:00Z', buyer: { name: 'Kent County Council' },
    tender: { title: 'Cleaning', description: 'Office cleaning.', value: { amount: 50000 }, tenderPeriod: { endDate: '2026-11-30T12:00:00Z' },
      items: [{ classification: { id: '90910000' } }], deliveryAddresses: [{ region: 'South East' }] },
  }, 'contracts-finder');
  assert.equal(n.buyer, 'Kent County Council');
  assert.equal(n.value_gbp, 50000);
  assert.deepEqual(n.cpv, ['90910000']);
  assert.equal(n.region, 'South East');
  assert.equal(parseRelease({ ocid: 'x', tender: {} }, 'x'), null);
});

test('extractive summary', () => {
  assert.equal(extractiveSummary('One. Two. Three.'), 'One. Two.');
});

test('only open tender releases are kept', () => {
  const base = { ocid: 'o1', tender: { title: 'T', status: 'active' } };
  assert.ok(parseRelease({ ...base, tag: ['tender'] }, 'x'));
  assert.equal(parseRelease({ ...base, tag: ['award'] }, 'x'), null);
  assert.equal(parseRelease({ ...base, tag: ['tender'], tender: { title: 'T', status: 'cancelled' } }, 'x'), null);
});

test('ingest follows links.next and records page stats', async () => {
  const pages = { a: { releases: [{ ocid: 'o1', tag: ['tender'], tender: { title: 'One' } }, { ocid: 'o2', tag: ['award'], tender: { title: 'Two' } }], links: { next: 'b' } },
    b: { releases: [{ ocid: 'o3', tag: ['tender'], tender: { title: 'Three' } }] } };
  const calls = [];
  const fake = async (url) => { calls.push(url); const key = url === 'b' ? 'b' : 'a'; return { ok: true, status: 200, json: async () => pages[key] }; };
  const inserted = [];
  const pool = { query: async (_sql, p) => { inserted.push(p[0]); } };
  const { ingest } = await import('../src/ocds.js');
  const stats = await ingest(pool, { fetchImpl: fake, delayMs: 0 });
  assert.deepEqual(stats['contracts-finder'], { pages: 2, releases: 3, kept: 2, more: false });
  assert.ok(inserted.includes('o1') && inserted.includes('o3') && !inserted.includes('o2'));
});
