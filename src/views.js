import { esc } from './core/core-routes.js';
import { extractiveSummary } from './matcher.js';

export const PRICE_GBP = Number(process.env.PRICE_GBP || 29);
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const price = `£${PRICE_GBP}`;
export const REGIONS = ['Anywhere in the UK', 'London', 'South East', 'South West', 'East of England', 'East Midlands', 'West Midlands',
  'North East', 'North West', 'Yorkshire and the Humber', 'Wales', 'Scotland', 'Northern Ireland'];
const gbp = (v) => (v == null ? 'Value not stated' : `£${Math.round(Number(v)).toLocaleString('en-GB')}`);
const daysLeft = (d) => (d ? Math.ceil((new Date(d) - Date.now()) / 864e5) : null);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not stated');

// Hi-vis identity: slate ink, site-safety orange for fit scores, docket stubs.
const CSS = `
@font-face{font-family:'BarlowC';src:url(/fonts/bc-600.woff2) format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:'BarlowC';src:url(/fonts/bc-800.woff2) format('woff2');font-weight:800;font-display:swap}
@font-face{font-family:'Barlow';src:url(/fonts/b-400.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'Barlow';src:url(/fonts/b-600.woff2) format('woff2');font-weight:600;font-display:swap}
:root{--bg:#F2F3F0;--card:#FFFFFF;--ink:#26303B;--ink-2:#5C6672;--rule:#D6DAD4;--hivis:#FF6A13;--hivis-2:#E65A08;--ok:#2E7D4F;--warn:#B44A0B;--focus:#FF6A13}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--ink);font:400 18px/1.55 'Barlow',system-ui,sans-serif}
body{margin:0}a{color:inherit;text-underline-offset:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:4px}
.wrap{max-width:1080px;margin:0 auto;padding-inline:24px}
.top{display:flex;justify-content:space-between;align-items:center;padding-block:20px}
.brand{font:800 28px/1 'BarlowC',sans-serif;text-decoration:none;display:flex;align-items:center;gap:10px}
.brand i{display:inline-block;width:22px;height:22px;background:var(--hivis);border-radius:4px;transform:rotate(45deg)}
.top nav a{margin-left:22px;font-size:16px;color:var(--ink-2)}
h1,h2,h3{font-family:'BarlowC',sans-serif;margin:0;line-height:1.02}
h1{font-size:clamp(44px,6vw,72px);font-weight:800;max-width:16ch}
h2{font-size:clamp(32px,4vw,46px);font-weight:800}
.lede{font-size:21px;color:var(--ink-2);max-width:46ch;margin:18px 0 0}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:start;padding-block:40px 64px}
.panel{background:var(--card);border:2px solid var(--ink);border-radius:14px;padding:26px}
.panel h3{font-size:28px;font-weight:800;margin-bottom:12px}
form.stack{display:flex;flex-direction:column;gap:12px}
label{font-weight:600;font-size:16px}
textarea,input,select{font:inherit;padding:13px 14px;border:2px solid var(--ink);border-radius:10px;background:var(--card);color:var(--ink);width:100%}
textarea{min-height:130px;resize:vertical}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{font:800 21px/1 'BarlowC',sans-serif;padding:16px 22px;border:0;border-radius:10px;background:var(--hivis);color:var(--ink);cursor:pointer;text-decoration:none;display:inline-block;text-align:center}
.btn:hover{background:var(--hivis-2)}.btn.dark{background:var(--ink);color:#fff}
.hint{font-size:15px;color:var(--ink-2)}

/* the docket */
.dockets{list-style:none;padding:0;margin:24px 0}
.docket{display:grid;grid-template-columns:92px minmax(0,1fr) 190px;background:var(--card);border:1px solid var(--rule);border-radius:12px;margin-bottom:14px;overflow:hidden}
.fit{background:var(--hivis);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 6px}
.fit b{font:800 46px/1 'BarlowC',sans-serif}.fit span{font:600 14px 'BarlowC',sans-serif}
.docket .body{padding:16px 20px}
.docket h3{font-size:25px;font-weight:600}.docket h3 a{text-decoration:none}.docket h3 a:hover{text-decoration:underline}
.docket .buyer{color:var(--ink-2);font-size:16px;margin-top:2px}
.docket .sum{margin:8px 0 6px;font-size:16px}
.docket .why{font-size:14px;color:var(--ink-2)}
.docket .why b{color:var(--ink)}
.stub{border-left:2px dashed var(--rule);padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-size:15px}
.stub b{display:block;font:800 26px/1.05 'BarlowC',sans-serif}
.stub .soon b{color:var(--warn)}
.stub form button{background:none;border:0;padding:0;font:inherit;font-size:14px;color:var(--ink-2);text-decoration:underline;cursor:pointer}
.band{padding-block:56px;border-top:1px solid var(--rule)}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin-top:24px;counter-reset:s}
.steps div{counter-increment:s}.steps div::before{content:counter(s);display:block;font:800 40px/1 'BarlowC',sans-serif;color:var(--hivis-2)}
.steps p{color:var(--ink-2);margin:6px 0 0}
.amount{font:800 72px/1 'BarlowC',sans-serif}.amount small{font:600 22px 'BarlowC',sans-serif;color:var(--ink-2)}
.cta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:center;background:var(--ink);color:#fff;border-radius:16px;padding:30px;margin:28px 0}
.cta p{color:#C9D0D8}.cta .hint{color:#C9D0D8}
.cta input{border-color:#fff}
.empty{background:var(--card);border:1px dashed var(--rule);border-radius:12px;padding:26px;color:var(--ink-2)}
.msg{padding-block:56px 90px;max-width:680px}.msg .body{color:var(--ink-2);margin:16px 0 24px}
footer{border-top:1px solid var(--rule);padding-block:24px 44px;font-size:15px;color:var(--ink-2);margin-top:30px}footer a{margin-right:18px}
@media (max-width:860px){.hero,.cta{grid-template-columns:1fr}.steps{grid-template-columns:1fr}.docket{grid-template-columns:72px minmax(0,1fr)}.stub{grid-column:1/-1;border-left:0;border-top:2px dashed var(--rule);flex-direction:row;flex-wrap:wrap;gap:18px}.fit b{font-size:36px}}
@media (max-width:520px){.top nav a:first-child{display:none}.row2{grid-template-columns:1fr}}
`;

function layout({ title, description, body, canonical }) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<style>${CSS}</style></head><body><div class="wrap">
<header class="top"><a class="brand" href="/"><i aria-hidden="true"></i>Tender Scout</a><nav><a href="/#how">How it works</a><a href="/pricing">Pricing</a></nav></header>
<main>${body}</main>
<footer><p>Tender Scout is an independent service. Notices come from Contracts Finder and Find a Tender under the Open Government Licence. Always read the full notice before bidding. Not affiliated with the UK Government.</p>
<a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer></div></body></html>`;
}

export function profileForm(p = {}) {
  return `<form class="stack" method="post" action="/profile">
<label for="d">What does your business do?</label>
<textarea id="d" name="description" required minlength="20" maxlength="1200" placeholder="e.g. We are a commercial cleaning company in Kent. Office cleaning, deep cleans after building work, window cleaning. 12 staff, DBS checked.">${esc(p.description || '')}</textarea>
<div class="row2"><div><label for="r">Where do you work?</label><select id="r" name="region">${REGIONS.map((r) => `<option ${p.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
<div><label for="v">Smallest contract worth bidding for</label><select id="v" name="min_value">${[['0', 'Any size'], ['10000', '£10,000'], ['25000', '£25,000'], ['50000', '£50,000'], ['100000', '£100,000']].map(([v, l]) => `<option value="${v}" ${String(p.min_value || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
<button class="btn">Show my matching contracts</button><span class="hint">Free. No account or card needed to see your matches.</span></form>`;
}

function docket(n, { token } = {}) {
  const dl = daysLeft(n.deadline);
  const sum = n.summary || extractiveSummary(n.description);
  return `<li class="docket"><div class="fit" aria-label="Fit score ${n.score} out of 100"><b>${n.score}</b><span>fit</span></div>
<div class="body"><h3><a href="/tenders/${encodeURIComponent(n.ocid)}">${esc(n.title)}</a></h3><div class="buyer">${esc(n.buyer || 'Public buyer')}${n.region ? `, ${esc(n.region)}` : ''}</div>
${sum ? `<p class="sum">${esc(sum)}</p>` : ''}${n.terms?.length ? `<div class="why">Matched on <b>${n.terms.map(esc).join(', ')}</b></div>` : ''}</div>
<div class="stub"><div><span>Value</span><b>${esc(gbp(n.value_gbp))}</b></div><div class="${dl != null && dl <= 7 ? 'soon' : ''}"><span>Bids close</span><b>${dl == null ? 'Not stated' : dl <= 0 ? 'Today' : `${dl} day${dl === 1 ? '' : 's'}`}</b></div>
${token ? `<form method="post" action="/feedback"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="ocid" value="${esc(n.ocid)}"><button>Not relevant, hide it</button></form>` : ''}</div></li>`;
}

export function homePage({ count }) {
  return layout({
    title: 'Tender Scout: public contracts your small business can win',
    description: `Describe your business and see matching UK public sector contracts. Weekday email alerts for ${price} a month after a ${TRIAL_DAYS}-day free trial.`,
    body: `<section class="hero"><div><h1>Public contracts your business could win, found for you.</h1>
<p class="lede">Councils, schools and the NHS publish thousands of contracts a month. Tell us what you do and we will pick out the ones that fit, with the value and closing date up front.</p>
${count ? `<p class="hint" style="margin-top:18px">${count.toLocaleString('en-GB')} open notices checked this month.</p>` : ''}</div>
<div class="panel"><h3>See your matches now</h3>${profileForm()}</div></section>
<section class="band" id="how"><h2>How it works</h2><div class="steps">
<div><h3 style="font-size:26px">Describe your business</h3><p>A few sentences in your own words: what you do, where, and roughly how big a job you can take on.</p></div>
<div><h3 style="font-size:26px">We read every notice</h3><p>Each weekday morning we check new notices on Contracts Finder and Find a Tender and score how well each fits.</p></div>
<div><h3 style="font-size:26px">You get a short list</h3><p>One email with the best fits, each with its value, closing date and a link to the full notice.</p></div></div></section>`,
  });
}

export function matchesPage({ profile, matches, stripeReady, flash }) {
  return layout({
    title: 'Your matching contracts | Tender Scout', description: 'Public contracts matched to your business.',
    body: `${flash ? `<p class="empty" style="border-style:solid">${esc(flash)}</p>` : ''}
<section style="padding-block:24px 0"><h1 style="font-size:clamp(38px,5vw,60px);max-width:20ch">${matches.length} open contract${matches.length === 1 ? '' : 's'} match your business</h1>
<p class="lede">From the last 30 days, best fit first. Hide anything that is not right and future matches get sharper.</p></section>
<div class="cta"><div><h2 style="color:#fff">Get new matches every weekday</h2><p>${price} a month after a ${TRIAL_DAYS}-day free trial. Cancel from any email.</p></div>
<form class="stack" method="post" action="/subscribe"><input type="hidden" name="token" value="${esc(profile.token)}">
<label for="e" style="color:#fff">Email for alerts</label><input id="e" type="email" name="email" required autocomplete="email" value="${esc(profile.email || '')}" placeholder="you@yourbusiness.co.uk">
<button class="btn">Start my ${TRIAL_DAYS}-day free trial</button><span class="hint">${stripeReady ? 'Card needed on the next page; you will not be charged until the trial ends.' : 'Alerts open soon. Sign up now and you will not be charged.'}</span></form></div>
<ul class="dockets">${matches.length ? matches.map((n) => docket(n, { token: profile.token })).join('') : '<li class="empty">Nothing in the last 30 days fits closely yet. Try adding more detail about what you do, or widen the area.</li>'}</ul>
<section class="band"><h2>Change what you are looking for</h2><div class="panel" style="margin-top:18px">${profileForm(profile)}</div></section>`,
  });
}

export function noticePage({ n, baseUrl }) {
  const dl = daysLeft(n.deadline);
  return layout({
    title: `${n.title} | ${n.buyer || 'Public contract'} | Tender Scout`, canonical: `${baseUrl}/tenders/${encodeURIComponent(n.ocid)}`,
    description: `${n.buyer || 'A public buyer'} is tendering: ${n.title}. Value ${gbp(n.value_gbp)}, bids close ${fmt(n.deadline)}.`,
    body: `<section class="msg" style="max-width:820px"><h1 style="font-size:clamp(34px,5vw,56px);max-width:none">${esc(n.title)}</h1>
<p class="lede">${esc(n.buyer || 'Public buyer')}${n.region ? `, ${esc(n.region)}` : ''}</p>
<ul class="dockets">${docket({ ...n, score: n.score ?? '–', terms: [] })}</ul>
<p>${esc(n.description || '').slice(0, 2000)}</p>
<p><a class="btn dark" href="${esc(n.url)}" rel="nofollow">Read the full notice</a></p>
<p class="hint">Bids close ${esc(fmt(n.deadline))}${dl != null && dl > 0 ? `, in ${dl} days` : ''}. Source: ${n.source === 'find-a-tender' ? 'Find a Tender' : n.source === 'contracts-finder' ? 'Contracts Finder' : esc(n.source)}.</p>
<div class="cta"><div><h2 style="color:#fff">Find contracts like this for your business</h2></div><a class="btn" href="/">See my matches</a></div></section>`,
  });
}

export function pricingPage() {
  return layout({ title: `Pricing: ${price} a month | Tender Scout`, description: `Tender Scout costs ${price} a month after a ${TRIAL_DAYS}-day free trial.`,
    body: `<section class="hero"><div><h1>One won contract pays for years of alerts.</h1><p class="lede">${price} a month after a ${TRIAL_DAYS}-day free trial. One business profile, every weekday, cancel any time.</p></div>
<div class="panel"><div class="amount">${price}<small> a month</small></div><ul><li>Every new notice from Contracts Finder and Find a Tender, checked daily</li><li>A fit score and the reason it matched</li><li>Value and closing date up front</li><li>${TRIAL_DAYS} days free, cancel from any email</li></ul><a class="btn" href="/">See my matches first</a></div></section>` });
}

export function messagePage(title, html, { action } = {}) {
  return layout({ title: `${title} | Tender Scout`, description: title,
    body: `<section class="msg"><h2>${esc(title)}</h2><div class="body">${html}</div>${action ?? '<a class="btn" href="/">Find my matches</a>'}</section>` });
}

export function digestEmail({ matches, manageUrl, matchesUrl }) {
  return {
    subject: `${matches.length} new contract${matches.length === 1 ? '' : 's'} for your business`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:600px"><h2>${matches.length} new match${matches.length === 1 ? '' : 'es'}</h2>
${matches.map((n) => `<p><b>${esc(n.title)}</b> (fit ${n.score})<br>${esc(n.buyer || '')}. ${esc(gbp(n.value_gbp))}. Closes ${esc(fmt(n.deadline))}.<br><a href="${esc(n.url)}">Read the notice</a></p>`).join('')}
<p><a href="${esc(matchesUrl)}">See all your matches</a></p><hr><p style="font-size:13px;color:#666">Tender Scout · <a href="${esc(manageUrl)}">Manage or cancel</a></p></div>`,
    text: matches.map((n) => `${n.title} (${n.buyer}) ${gbp(n.value_gbp)} closes ${fmt(n.deadline)} ${n.url}`).join('\n') + `\nManage: ${manageUrl}`,
  };
}
