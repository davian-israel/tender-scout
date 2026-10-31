import crypto from 'node:crypto';

// Signed, non-expiring token for one-click "manage / cancel" links in emails.
const secret = () => process.env.APP_SECRET || 'dev-secret-change-me';

export function signId(id) {
  const mac = crypto.createHmac('sha256', secret()).update(String(id)).digest('base64url').slice(0, 22);
  return `${id}.${mac}`;
}

export function verifyToken(token) {
  const [id, mac] = String(token || '').split('.');
  if (!id || !mac) return null;
  const expected = signId(id).split('.')[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? Number(id) : null;
}
