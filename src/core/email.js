// Transactional email via Resend. Without RESEND_API_KEY, emails are logged (dev mode).
export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || `${process.env.APP_NAME || 'Venture'} <hello@example.com>`;
  if (!key) {
    console.log(`[email:dev] to=${to} subject="${subject}"`);
    return { id: 'dev', dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}
