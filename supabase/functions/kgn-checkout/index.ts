import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const origin = Deno.env.get('KGN_SITE_ORIGIN') || 'https://waquarahmad622-lgtm.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store', 'Content-Type': 'application/json',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const privateKey = /^[0-9a-f]{64}$/;
const paymentURL = (value: string) => {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password ||
      !['rzp.io', 'rzp.pay', 'razorpay.com'].some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw Error('Unexpected payment URL');
  return u.href;
};

// Expiry alone does not release an issued link's stock. Require a final, unpaid
// gateway state, a grace period, and a fresh row lock in the service-only RPC.
async function releaseExpired(db: ReturnType<typeof createClient>, authorization: string) {
  const { data: rows, error } = await db.rpc('kgn_checkout_expiry_candidates');
  if (error || !Array.isArray(rows)) return;
  await Promise.allSettled(rows.map(async row => {
    if (!row.payment_link_id && row.payment_link_state === 'none') {
      await db.rpc('kgn_release_expired_checkout', { p_id: row.id, p_link: null });
      return;
    }
    if (!/^plink_[A-Za-z0-9]+$/.test(row.payment_link_id || '')) return;
    const result = await fetch('https://api.razorpay.com/v1/payment_links/' + row.payment_link_id, {
      headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(4000),
    });
    if (!result.ok) return;
    const link = await result.json();
    if (link.id === row.payment_link_id && link.reference_id === row.id &&
        link.currency === 'INR' && link.amount === row.amount && link.amount_paid === 0 &&
        ['expired', 'cancelled'].includes(link.status) && (!link.payments || link.payments.length === 0)) {
      await db.rpc('kgn_release_expired_checkout', { p_id: row.id, p_link: link.id });
    }
  }));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) return json({ error: 'Origin not allowed' }, 403);
  if (Number(req.headers.get('content-length')) > 32768) return json({ error: 'Request too large' }, 413);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 32768) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
  } catch { return json({ error: 'Invalid checkout request' }, 400); }
  if (typeof body.token !== 'string' || !privateKey.test(body.token)) return json({ error: 'Invalid private checkout key' }, 400);
  if (body.id !== undefined && (typeof body.id !== 'string' || !uuid.test(body.id))) return json({ error: 'Invalid order' }, 400);
  if (!body.id && (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 30 ||
      !Number.isSafeInteger(body.expected_subtotal) || body.expected_subtotal <= 0 || body.expected_subtotal > 100000000)) {
    return json({ error: 'Check selected items and total' }, 400);
  }
  const key = Deno.env.get('RAZORPAY_KEY_ID'), secret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!key || !secret) return json({ error: 'Online payment is not available. Contact the store.' }, 503);
  const authorization = 'Basic ' + btoa(key + ':' + secret);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let id = body.id;
  try {
    await releaseExpired(db, authorization);
    if (!id) {
      // Public guest purchase. Prices, availability, policy, phone rate limit,
      // idempotency and stock reservation are checked in one DB transaction.
      let verifiedUser: string | null = null;
      if (body.phone_verification === true) {
        const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
        if (!bearer) return json({ error: 'Verify your mobile OTP before payment' }, 401);
        const { data: identity, error: authError } = await db.auth.getUser(bearer);
        const phone = identity?.user?.phone?.replace(/^\+/, '');
        if (authError || !identity?.user?.phone_confirmed_at || phone !== '91' + String(body.buyer?.phone || '').trim()) {
          return json({ error: 'Mobile verification expired or number changed. Verify your mobile again' }, 401);
        }
        verifiedUser = identity.user.id;
      }
      const { data, error } = await db.rpc(verifiedUser ? 'kgn_prepare_phone_checkout' : 'kgn_prepare_checkout', {
        p_buyer: body.buyer, p_lines: body.lines, p_token: body.token,
        p_policy: body.policy, p_expected_subtotal: body.expected_subtotal,
        ...(verifiedUser ? { p_phone_user: verifiedUser } : {}),
      });
      if (error) return json({ error: error.message }, 409);
      id = data.id;
    }
    // The random 256-bit order key authenticates access to this one checkout.
    // Neither an order UUID alone nor the public Supabase key grants access.
    const { data: claim, error } = await db.rpc('kgn_claim_checkout_payment', { p_id: id, p_token: body.token });
    if (error) return json({ id, error: error.message }, 409);
    if (claim.paid) return json({ id, paid: true });
    if (claim.existing) return json({ id, url: paymentURL(claim.url), amount: claim.amount });
    try {
      const result = await fetch('https://api.razorpay.com/v1/payment_links/', {
        method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          amount: claim.amount, currency: 'INR', accept_partial: false, reference_id: id,
          description: 'K.G.N. Fashion Zone order ' + id + ' — delivery charge payable separately to courier',
          expire_by: claim.expire_by, notify: { sms: false, email: false }, reminder_enable: false,
          callback_url: origin + '/kgn-fashion-zone/index.html?checkout_return=' + id, callback_method: 'get',
          notes: { kgn_order_id: id, delivery_payment: 'courier_collect' },
        }),
      });
      if (!result.ok) throw Error('Payment setup could not finish. Contact the store with your Order ID.');
      const link = await result.json();
      const target = paymentURL(link.short_url);
      if (!/^plink_[A-Za-z0-9]+$/.test(link.id || '') || link.reference_id !== id || link.amount !== claim.amount ||
          link.currency !== 'INR' || link.accept_partial !== false || link.expire_by !== claim.expire_by) {
        throw Error('Payment setup needs store verification.');
      }
      const { data: saved, error: saveError } = await db.from('kgn_orders').update({
        payment_link_id: link.id, payment_url: target, payment_link_state: 'ready', updated_at: new Date().toISOString(),
      }).eq('id', id).eq('checkout_mode', 'direct').eq('payment_link_state', 'creating').select('id').maybeSingle();
      if (saveError || !saved) throw Error('Payment link needs store verification.');
      return json({ id, url: target, amount: claim.amount });
    } catch (error) {
      // Never blindly retry POST after a timeout: the provider may have created it.
      await db.from('kgn_orders').update({ payment_link_state: 'uncertain' }).eq('id', id).eq('payment_link_state', 'creating');
      return json({ id, error: error instanceof Error ? error.message : 'Payment setup needs store verification.' }, 502);
    }
  } catch { return json({ id, error: 'Checkout connection failed. Retry this checkout or contact the store.' }, 503); }
});
