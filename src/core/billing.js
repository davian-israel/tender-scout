import Stripe from 'stripe';
import { track } from './db.js';

export function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/**
 * Creates a pending subscriber and (when Stripe is configured) a Checkout session.
 * Without Stripe the subscriber stays 'pending' = waitlist, and the user lands on /thanks?pending=1.
 */
export async function startCheckout({ pool, stripe, baseUrl }, { email, ref, productName, priceGbp, trialDays = 0, cancelPath = '/' }) {
  const { rows } = await pool.query('INSERT INTO subscribers(email, ref) VALUES ($1, $2) RETURNING id', [email, ref]);
  const id = rows[0].id;
  await track(pool, 'checkout_started', ref);
  if (!stripe) return { url: `${baseUrl}/thanks?pending=1`, subscriberId: id, configured: false };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: String(id),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: Math.round(priceGbp * 100),
        recurring: { interval: 'month' },
        product_data: { name: productName },
      },
    }],
    ...(trialDays ? { subscription_data: { trial_period_days: trialDays } } : {}),
    metadata: { subscriber_id: String(id), ref: String(ref ?? '') },
    success_url: `${baseUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}${cancelPath}${cancelPath.includes('?') ? '&' : '?'}cancelled=1`,
  });
  await pool.query('UPDATE subscribers SET checkout_session = $1 WHERE id = $2', [session.id, id]);
  return { url: session.url, subscriberId: id, configured: true };
}

/** Verified Stripe event handler. Idempotent. Trials count as 'trialing' until the first paid invoice. */
export async function handleStripeEvent(pool, event) {
  const o = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const id = Number(o.client_reference_id || o.metadata?.subscriber_id);
    if (!id) return null;
    const status = o.payment_status === 'no_payment_required' ? 'trialing' : 'active';
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = $1, stripe_customer = $2, stripe_subscription = $3, activated_at = now()
       WHERE id = $4 AND status IN ('pending')`,
      [status, o.customer, o.subscription, id],
    );
    if (rowCount) await track(pool, status === 'active' ? 'paid' : 'trial_started', id);
    return id;
  }
  if (event.type === 'invoice.paid' && o.subscription && o.amount_paid > 0) {
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'active' WHERE stripe_subscription = $1 AND status = 'trialing'`, [o.subscription]);
    if (rowCount) await track(pool, 'paid', o.subscription);
  }
  if (event.type === 'customer.subscription.deleted') {
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'cancelled', cancelled_at = now()
       WHERE stripe_subscription = $1 AND status IN ('active','trialing')`, [o.id]);
    if (rowCount) await track(pool, 'cancelled', o.id);
  }
  return null;
}
