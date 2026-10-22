interface V2Env {
  DB: D1Database;
  PRODUCT_FILES?: R2Bucket;
  ADMIN_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}
type V2Session = { id: string; email: string };
type V2Body = Record<string, unknown>;
type V2Product = { id: string; product_key: string; title: string; description: string; product_type: string; price_amount: number; currency: string; is_free: number; is_published: number; checkout_url: string | null; file_key: string; original_filename: string; file_content_type: string; created_at: string; updated_at: string };
type V2PromoCandidate = { id: string; code: string; discount_type: string; discount_value: number; max_uses: number | null; used_count: number; product_key: string | null };
class V2InputError extends Error { readonly status = 400; }
const V2_COOKIE = 'sf_session';
const V2_MAX_FILE = 25 * 1024 * 1024;

function v2Reply(body: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8'); h.set('Cache-Control', 'no-store'); h.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}
function v2Token(request: Request): string | null {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === V2_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}
async function v2Digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function v2Session(request: Request, env: V2Env): Promise<V2Session | null> {
  const token = v2Token(request); if (!token) return null;
  return env.DB.prepare('SELECT u.id,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1').bind(await v2Digest(token), Date.now()).first<V2Session>();
}
function v2Admin(session: V2Session | null, env: V2Env): boolean {
  return Boolean(session && env.ADMIN_EMAIL && session.email.trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase());
}
function v2Field(body: V2Body, key: string, max = 2000): string {
  const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  if (value.length > max) throw new V2InputError(`Pole ${key} jest zbyt długie.`);
  return value;
}
async function v2Body(request: Request): Promise<V2Body> {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) throw new V2InputError('Dane muszą być przesłane jako JSON.');
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new V2InputError('Nieprawidłowe dane formularza.');
  return value as V2Body;
}
async function v2Product(env: V2Env, key: string): Promise<V2Product | null> {
  return env.DB.prepare('SELECT * FROM products WHERE product_key=? LIMIT 1').bind(key).first<V2Product>();
}
async function v2Gate(request: Request, env: V2Env, admin = false): Promise<{ session: V2Session | null; response: Response | null }> {
  const session = await v2Session(request, env);
  if (!session) return { session: null, response: v2Reply({ error: 'Zaloguj się, aby kontynuować.' }, 401) };
  if (admin && !v2Admin(session, env)) return { session, response: v2Reply({ error: 'Ta funkcja jest dostępna wyłącznie dla administratora.' }, 403) };
  return { session, response: null };
}
function v2SafeFilename(name: string): string {
  return (name.split(/[\\/]/).pop() || 'material').normalize('NFKD').replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 140) || 'material';
}
function v2ValidateDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')); }
async function v2DisplayNumber(env: V2Env, createdAt: string): Promise<string> {
  const year = Number(createdAt.slice(0, 4)) || new Date().getUTCFullYear();
  const row = await env.DB.prepare('INSERT INTO order_number_sequences(year,last_number) VALUES (?,1) ON CONFLICT(year) DO UPDATE SET last_number=last_number+1 RETURNING last_number').bind(year).first<{ last_number: number }>();
  return `SF-${year}-${String(row?.last_number || 1).padStart(4, '0')}`;
}
async function v2VerifyStripe(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((x) => x.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v || '');
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const msg = new TextEncoder().encode(`${timestamp}.${raw}`);
  for (const value of signatures) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(value)) continue;
    const sig = Uint8Array.from(value.match(/.{2}/g) || [], (x) => parseInt(x, 16));
    if (sig.length && await crypto.subtle.verify('HMAC', key, sig, msg)) return true;
  }
  return false;
}
async function v2Webhook(request: Request, env: V2Env): Promise<Response | null> {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  const raw = await request.clone().text();
  // Legacy handler pozostaje właścicielem starych checkoutów i odrzuca błędne podpisy.
  if (!(await v2VerifyStripe(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return null;
  let event: Record<string, any>;
  try { event = JSON.parse(raw) as Record<string, any>; } catch { return null; }
  const checkout = event.data?.object as Record<string, any> | undefined;
  if (!checkout || checkout.object !== 'checkout.session' || checkout.metadata?.v2_checkout !== '1') return null;
  const eventId = typeof event.id === 'string' ? event.id : '';
  const eventType = typeof event.type === 'string' ? event.type : '';
  if (!eventId) return v2Reply({ error: 'Brak identyfikatora zdarzenia Stripe.' }, 400);
  const receivedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO stripe_webhook_diagnostics(event_id,event_type,status,received_at)
    VALUES(?,?,'received',?) ON CONFLICT(event_id) DO UPDATE SET event_type=excluded.event_type`)
    .bind(eventId, eventType || 'unknown', receivedAt).run();
  const diagnose = (status: 'received' | 'processed' | 'ignored' | 'pending' | 'failed' | 'duplicate', message = '', sessionId = '', orderId = '', at = new Date().toISOString()) =>
    env.DB.prepare('UPDATE stripe_webhook_diagnostics SET status=?,error_message=?,checkout_session_id=?,order_id=?,processed_at=? WHERE event_id=?')
      .bind(status, message.slice(0, 500), sessionId, orderId, at, eventId).run();
  const reject = async (message: string, sessionId = '') => {
    await diagnose('failed', message, sessionId);
    return v2Reply({ error: message }, 400);
  };
  const sessionId = typeof checkout.id === 'string' ? checkout.id : '';
  if (eventType === 'checkout.session.async_payment_failed') {
    await diagnose('failed', 'Stripe zgłosił nieudaną płatność asynchroniczną.', sessionId);
    return v2Reply({ received: true, failed: true });
  }
  if (eventType === 'checkout.session.expired') {
    await diagnose('failed', 'Sesja Checkout wygasła bez potwierdzonej płatności.', sessionId);
    return v2Reply({ received: true, expired: true });
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(eventType)) {
    await diagnose('ignored', 'Zdarzenie nie wymaga nadania dostępu.', sessionId);
    return v2Reply({ received: true, ignored: true });
  }
  if (checkout.mode !== 'payment' || checkout.payment_status !== 'paid') {
    await diagnose('pending', 'Stripe nie potwierdził jeszcze opłacenia sesji.', sessionId);
    return v2Reply({ received: true, ignored: true });
  }
  const userId = typeof checkout.metadata?.user_id === 'string' ? checkout.metadata.user_id : '';
  const productKey = typeof checkout.metadata?.product_key === 'string' ? checkout.metadata.product_key : '';
  const amount = Number(checkout.amount_total);
  const expectedAmount = Number(checkout.metadata?.unit_amount_cents);
  const currency = typeof checkout.currency === 'string' ? checkout.currency.toUpperCase() : 'PLN';
  if (!userId || !productKey || !sessionId || !Number.isInteger(amount) || amount < 0 || !Number.isInteger(expectedAmount) || expectedAmount < 0) return reject('Brak prawidłowych danych zamówienia w sesji Stripe.', sessionId);
  const prior = await env.DB.prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id=? LIMIT 1').bind(eventId).first<{ event_id: string }>();
  if (prior) {
    await diagnose('duplicate', 'Zdarzenie Stripe zostało już przetworzone.', sessionId);
    return v2Reply({ received: true, duplicate: true });
  }
  const existing = await env.DB.prepare('SELECT id FROM orders WHERE order_number=? LIMIT 1').bind(`STRIPE-${sessionId}`).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId, eventType, new Date().toISOString()).run();
    await diagnose('duplicate', 'Zamówienie dla tej sesji Checkout jest już zapisane.', sessionId, existing.id);
    return v2Reply({ received: true, duplicate: true });
  }
  const user = await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first<{ id: string }>();
  const item = await env.DB.prepare('SELECT id,product_key,title,product_type,is_free,price_amount,currency,is_published FROM products WHERE product_key=? LIMIT 1').bind(productKey).first<{ id: string; product_key: string; title: string; product_type: string; is_free: number; price_amount: number; currency: string; is_published: number }>();
  if (!user || !item || String(checkout.client_reference_id || '') !== userId || String(checkout.metadata?.product_id || '') !== item.id || currency !== (item.currency || 'PLN').toUpperCase()) return reject('Nie udało się dopasować opłaconej sesji do użytkownika lub produktu.', sessionId);
  if (expectedAmount !== amount) return reject('Kwota płatności nie zgadza się z kwotą zapisaną w sesji Stripe.', sessionId);
  if (amount === 0 && checkout.metadata?.zero_total !== '1') return reject('Nieprawidłowa kwota zamówienia.', sessionId);
  const now = new Date().toISOString(), orderId = crypto.randomUUID();
  const promoId = typeof checkout.metadata?.promo_id === 'string' ? checkout.metadata.promo_id : '';
  const discount = Math.max(0, Number(checkout.metadata?.discount_cents || 0)) / 100;
  const analyticsSession = typeof checkout.metadata?.analytics_session_key === 'string' ? checkout.metadata.analytics_session_key.slice(0, 100) : '';
  const display = await v2DisplayNumber(env, now);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('INSERT INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId, eventType, now),
    env.DB.prepare("INSERT INTO orders(id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES(?,?,?,'paid',?,?,?,?)").bind(orderId, userId, `STRIPE-${sessionId}`, amount / 100, currency, now, now),
    env.DB.prepare('INSERT INTO order_display_numbers(order_id,display_number,created_at) VALUES(?,?,?)').bind(orderId, display, now),
    env.DB.prepare('INSERT INTO order_items(id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES(?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(), orderId, productKey, item.title, item.product_type, amount / 100, now),
    env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), userId, orderId, productKey, item.title, item.product_type, now, userId, productKey),
    env.DB.prepare("UPDATE stripe_webhook_diagnostics SET status='processed',error_message='',checkout_session_id=?,order_id=?,processed_at=? WHERE event_id=?").bind(sessionId, orderId, now, eventId),
  ];
  if (item.product_type === 'bundle') {
    const components = await env.DB.prepare('SELECT p.product_key,p.title,p.product_type FROM bundle_items b JOIN products p ON p.product_key=b.component_product_key WHERE b.bundle_key=? ORDER BY b.sort_order,b.component_product_key').bind(productKey).all<{ product_key: string; title: string; product_type: string }>();
    for (const component of components.results) {
      statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), userId, orderId, component.product_key, component.title, component.product_type, now, userId, component.product_key));
    }
  }
  if (promoId) {
    const promo = await env.DB.prepare('SELECT id,code FROM promotion_codes WHERE id=?').bind(promoId).first<{ id: string; code: string }>();
    if (promo) {
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO promotion_redemptions(id,promotion_id,order_id,user_id,code,discount_amount,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), promo.id, orderId, userId, promo.code, discount, now));
      statements.push(env.DB.prepare('UPDATE promotion_codes SET used_count=used_count+1,updated_at=? WHERE id=?').bind(now, promo.id));
    }
  }
  if (analyticsSession) {
    const setting = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='analytics_enabled'").first<{ setting_value: string }>();
    if (setting?.setting_value !== 'false') statements.push(env.DB.prepare("INSERT INTO product_analytics(id,event_type,product_key,path,session_key,user_id,created_at) VALUES(?,'purchase_confirmed',?,?,?, ?,?)").bind(crypto.randomUUID(), productKey, `/produkty/${productKey}`, analyticsSession, userId, now));
  }
  await env.DB.batch(statements);
  return v2Reply({ received: true, paid: true, display_order_number: display });
}
export async function handleV2Api(request: Request, env: V2Env): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
  if (path === '/api/stripe/webhook' && method === 'POST') {
    try { return await v2Webhook(request, env); }
    catch (error) { console.error('System Formy V2 webhook processing error:', error); return v2Reply({ error: 'Nie udało się przetworzyć webhooka. Stripe może bezpiecznie ponowić dostarczenie.' }, 500); }
  }
  // Rozszerzony bezpłatny odbiór obsługuje też składowe pakietu, zachowując dotychczasowy adres API.
  const legacyClaimMatch = path.match(/^\/api\/products\/([a-z0-9-]+)\/claim$/);
  if (legacyClaimMatch && method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return v2Reply({ error: 'Żądanie pochodzi z nieprawidłowej strony.' }, 403);
    try {
      const session = await v2Session(request, env); if (!session) return v2Reply({ error: 'Zaloguj się, aby odebrać materiał.' }, 401);
      const item = await v2Product(env, legacyClaimMatch[1]);
      if (!item || !item.is_published) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
      if (!item.is_free) return v2Reply({ error: 'Ten produkt nie jest dostępny do bezpłatnego odbioru.' }, 403);
      const old = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(session.id, item.product_key).first<{id:string}>();
      const now = new Date().toISOString(), statements: D1PreparedStatement[] = [];
      if (!old) statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES(?,?,NULL,?,?,?,'active',?)").bind(crypto.randomUUID(), session.id, item.product_key, item.title, item.product_type, now));
      if (item.product_type === 'bundle') {
        const components = await env.DB.prepare('SELECT p.product_key,p.title,p.product_type FROM bundle_items b JOIN products p ON p.product_key=b.component_product_key WHERE b.bundle_key=? AND p.is_published=1 ORDER BY b.sort_order,p.title').bind(item.product_key).all<{product_key:string;title:string;product_type:string}>();
        for (const component of components.results) statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?, ?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(),session.id,null,component.product_key,component.title,component.product_type,now,session.id,component.product_key));
      }
      if (statements.length) await env.DB.batch(statements);
      return v2Reply({ok:true,already_active:Boolean(old)});
    } catch (error) { console.error('System Formy V2 claim error:', error); return v2Reply({error:'Nie udało się odblokować materiału.'},500); }
  }
  // Starszy URL pobierania zachowuje obsługę dostępów nawet po ukryciu produktu w katalogu.
  const fileMatch = path.match(/^\/api\/products\/([a-z0-9-]+)\/download$/);
  if (fileMatch && method === 'GET') {
    try {
      const session = await v2Session(request, env); if (!session) return v2Reply({ error: 'Zaloguj się, aby pobrać materiał.' }, 401);
      const item = await v2Product(env, fileMatch[1]); if (!item) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
      const allowed = v2Admin(session, env) || Boolean(await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(session.id, item.product_key).first<{ id: string }>());
      if (!allowed) return v2Reply({ error: 'Brak dostępu do tego pliku.' }, 403);
      if (!env.PRODUCT_FILES) return v2Reply({ error: 'Magazyn plików R2 nie jest skonfigurowany.' }, 503);
      const object = await env.PRODUCT_FILES.get(item.file_key); if (!object) return v2Reply({ error: 'Plik produktu nie znajduje się w magazynie.' }, 404);
      const h = new Headers(); h.set('Content-Type', item.file_content_type || 'application/octet-stream'); h.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(item.original_filename).replace(/'/g, '%27')}`); h.set('Cache-Control', 'private, no-store'); h.set('X-Content-Type-Options', 'nosniff');
      return new Response(object.body, { status: 200, headers: h });
    } catch (error) { console.error('System Formy V2 download error:', error); return v2Reply({ error: 'Nie udało się pobrać materiału.' }, 500); }
  }
  if (!path.startsWith('/api/v2/')) return null;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return v2Reply({ error: 'Żądanie pochodzi z nieprawidłowej strony.' }, 403);
  }
  try {
    // Publiczny katalog, kategorie i szczegóły produktu.
    if (path === '/api/v2/products' && method === 'GET') {
      const [rows, cats] = await Promise.all([
        env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.created_at,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json,m.cover_key FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key WHERE p.is_published=1 ORDER BY p.created_at DESC").all(),
        env.DB.prepare('SELECT slug,title,description FROM product_categories WHERE is_active=1 ORDER BY sort_order,title').all(),
      ]);
      return v2Reply({ products: rows.results, categories: cats.results });
    }
    const coverMatch = path.match(/^\/api\/v2\/products\/([a-z0-9-]+)\/cover$/);
    if (coverMatch && method === 'GET') {
      const cover = await env.DB.prepare('SELECT p.is_published,m.cover_key FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key WHERE p.product_key=? LIMIT 1').bind(coverMatch[1]).first<{ is_published: number; cover_key: string | null }>();
      if (!cover || !cover.is_published || !cover.cover_key) return v2Reply({ error: 'Brak okładki produktu.' }, 404);
      if (!env.PRODUCT_FILES) return v2Reply({ error: 'Magazyn plików nie jest skonfigurowany.' }, 503);
      const object = await env.PRODUCT_FILES.get(cover.cover_key); if (!object) return v2Reply({ error: 'Nie znaleziono okładki.' }, 404);
      const headers = new Headers(); headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp'); headers.set('Cache-Control', 'public, max-age=3600'); headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(object.body, { status: 200, headers });
    }
    const publicDetail = path.match(/^\/api\/v2\/products\/([a-z0-9-]+)$/);
    if (publicDetail && method === 'GET') {
      const item = await env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.created_at,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json,m.cover_key FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key WHERE p.product_key=? AND p.is_published=1 LIMIT 1").bind(publicDetail[1]).first<Record<string, unknown>>();
      if (!item) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
      const components = await env.DB.prepare('SELECT p.product_key,p.title,p.description,p.product_type FROM bundle_items b JOIN products p ON p.product_key=b.component_product_key WHERE b.bundle_key=? AND p.is_published=1 ORDER BY b.sort_order,p.title').bind(publicDetail[1]).all();
      let contents: unknown[] = []; try { const v = JSON.parse(String(item.contents_json || '[]')); if (Array.isArray(v)) contents = v; } catch { contents = []; }
      return v2Reply({ product: { ...item, contents }, components: components.results });
    }
    if (path === '/api/v2/settings/public' && method === 'GET') {
      const rows = await env.DB.prepare("SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('support_email','store_notice','analytics_enabled')").all<{ setting_key: string; setting_value: string }>();
      const settings: Record<string, string> = {}; for (const row of rows.results) settings[row.setting_key] = row.setting_value;
      return v2Reply({ support_email: settings.support_email || '', store_notice: settings.store_notice || '', analytics_enabled: settings.analytics_enabled !== 'false' });
    }
    if (path === '/api/v2/analytics' && method === 'POST') {
      const setting = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='analytics_enabled'").first<{ setting_value: string }>();
      if (setting?.setting_value === 'false') return v2Reply({ ok: false, disabled: true });
      const body = await v2Body(request), type = v2Field(body, 'event_type', 40), productKey = v2Field(body, 'product_key', 100), page = v2Field(body, 'path', 400), sessionKey = v2Field(body, 'session_key', 100);
      if (!['page_view', 'product_view'].includes(type)) return v2Reply({ error: 'To zdarzenie może zapisać wyłącznie serwer.' }, 400);
      const s = await v2Session(request, env);
      await env.DB.prepare('INSERT INTO product_analytics(id,event_type,product_key,path,session_key,user_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), type, productKey || null, page, sessionKey, s?.id || null, new Date().toISOString()).run();
      return v2Reply({ ok: true }, 201);
    }

    // Złożenie zamówienia z walidacją ceny i kuponu po stronie serwera.
    if (path === '/api/v2/checkout/session' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return v2Reply({ error: 'Płatności Stripe nie są w pełni skonfigurowane.' }, 503);
      const body = await v2Body(request), key = v2Field(body, 'product_key', 100).toLowerCase(), code = v2Field(body, 'promotion_code', 80).toUpperCase(), analyticsSession = v2Field(body, 'analytics_session_key', 100);
      const item = await v2Product(env, key); if (!item || !item.is_published) return v2Reply({ error: 'Produkt nie jest dostępny.' }, 404);
      if (item.is_free) return v2Reply({ error: 'Ten produkt jest bezpłatny — użyj opcji odbioru.' }, 400);
      if (!Number.isFinite(item.price_amount) || item.price_amount <= 0) return v2Reply({ error: 'Produkt nie ma prawidłowej ceny.' }, 400);
      const entitlement = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, key).first<{ id: string }>();
      if (entitlement) return v2Reply({ error: 'Masz już dostęp do tego materiału.' }, 409);
      let totalCents = Math.round(item.price_amount * 100), discountCents = 0, promo: V2PromoCandidate | null = null;
      if (code) {
        promo = await env.DB.prepare('SELECT id,code,discount_type,discount_value,max_uses,used_count,product_key FROM promotion_codes WHERE code=? COLLATE NOCASE AND is_active=1 LIMIT 1').bind(code).first<V2PromoCandidate>();
        if (!promo) return v2Reply({ error: 'Kod rabatowy jest nieprawidłowy lub nieaktywny.' }, 400);
        const dates = await env.DB.prepare('SELECT starts_at,ends_at FROM promotion_codes WHERE id=?').bind(promo.id).first<{ starts_at: string | null; ends_at: string | null }>();
        const now = Date.now();
        if (dates?.starts_at && Date.parse(dates.starts_at) > now) return v2Reply({ error: 'Ten kod nie jest jeszcze aktywny.' }, 400);
        if (dates?.ends_at && Date.parse(dates.ends_at) < now) return v2Reply({ error: 'Ważność tego kodu rabatowego minęła.' }, 400);
        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return v2Reply({ error: 'Limit użyć tego kodu został wyczerpany.' }, 400);
        if (promo.product_key && promo.product_key !== key) return v2Reply({ error: 'Ten kod nie dotyczy wybranego produktu.' }, 400);
        discountCents = promo.discount_type === 'percent' ? Math.round(totalCents * Math.min(100, promo.discount_value) / 100) : Math.round(promo.discount_value * 100);
        discountCents = Math.min(totalCents, Math.max(0, discountCents)); totalCents -= discountCents;
      }
      if (totalCents === 0) {
        const now = new Date().toISOString(), orderId = crypto.randomUUID(), number = `PROMO-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
        // Numery SF są osobne od numerów technicznych używanych przez Stripe i zachowują istniejące zamówienia.
        const display = await v2DisplayNumber(env, now);
        const statements: D1PreparedStatement[] = [
          env.DB.prepare("INSERT INTO orders(id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES(?,?,?,'paid',0,?,?,?)").bind(orderId, gate.session!.id, number, item.currency || 'PLN', now, now),
          env.DB.prepare('INSERT INTO order_display_numbers(order_id,display_number,created_at) VALUES(?,?,?)').bind(orderId, display, now),
          env.DB.prepare('INSERT INTO order_items(id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES(?,?,?,?,?,1,0,?)').bind(crypto.randomUUID(), orderId, key, item.title, item.product_type, now),
          env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), gate.session!.id, orderId, key, item.title, item.product_type, now, gate.session!.id, key),
        ];
        if (item.product_type === 'bundle') {
          const components = await env.DB.prepare('SELECT p.product_key,p.title,p.product_type FROM bundle_items b JOIN products p ON p.product_key=b.component_product_key WHERE b.bundle_key=? AND p.is_published=1 ORDER BY b.sort_order,b.component_product_key').bind(key).all<{ product_key: string; title: string; product_type: string }>();
          for (const component of components.results) statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), gate.session!.id, orderId, component.product_key, component.title, component.product_type, now, gate.session!.id, component.product_key));
        }
        if (promo) {
          statements.push(env.DB.prepare('INSERT OR IGNORE INTO promotion_redemptions(id,promotion_id,order_id,user_id,code,discount_amount,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), promo.id, orderId, gate.session!.id, promo.code, discountCents / 100, now));
          statements.push(env.DB.prepare('UPDATE promotion_codes SET used_count=used_count+1,updated_at=? WHERE id=?').bind(now, promo.id));
        }
        if (analyticsSession) {
          const setting = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='analytics_enabled'").first<{ setting_value: string }>();
          if (setting?.setting_value !== 'false') statements.push(env.DB.prepare("INSERT INTO product_analytics(id,event_type,product_key,path,session_key,user_id,created_at) VALUES(?,'purchase_confirmed',?,?,?, ?,?)").bind(crypto.randomUUID(), key, `/produkty/${key}`, analyticsSession, gate.session!.id, now));
        }
        await env.DB.batch(statements);
        return v2Reply({ free: true, order_number: number, display_order_number: display });
      }
      const origin = url.origin, form = new URLSearchParams();
      form.set('mode', 'payment'); form.set('success_url', `${origin}/app/zamowienia?payment=success&session_id={CHECKOUT_SESSION_ID}`); form.set('cancel_url', `${origin}/produkty/${encodeURIComponent(key)}?payment=cancelled`);
      form.set('client_reference_id', gate.session!.id); form.set('customer_email', gate.session!.email);
      form.set('line_items[0][price_data][currency]', (item.currency || 'PLN').toLowerCase()); form.set('line_items[0][price_data][unit_amount]', String(totalCents)); form.set('line_items[0][price_data][product_data][name]', item.title); form.set('line_items[0][quantity]', '1');
      if (item.description) form.set('line_items[0][price_data][product_data][description]', item.description.slice(0, 500));
      form.set('metadata[v2_checkout]', '1'); form.set('metadata[user_id]', gate.session!.id); form.set('metadata[product_key]', key); form.set('metadata[product_id]', item.id); form.set('metadata[unit_amount_cents]', String(totalCents)); form.set('metadata[discount_cents]', String(discountCents));
      if (promo) form.set('metadata[promo_id]', promo.id);
      if (analyticsSession) form.set('metadata[analytics_session_key]', analyticsSession);
      form.set('payment_intent_data[metadata][user_id]', gate.session!.id); form.set('payment_intent_data[metadata][product_key]', key);
      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      const payload = await response.json() as Record<string, any>;
      if (!response.ok || typeof payload.url !== 'string') return v2Reply({ error: typeof payload.error?.message === 'string' ? `Stripe: ${payload.error.message}` : 'Nie udało się utworzyć sesji płatności.' }, 502);
      if (analyticsSession) await env.DB.prepare('INSERT INTO product_analytics(id,event_type,product_key,path,session_key,user_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'checkout_started', key, `/produkty/${key}`, analyticsSession, gate.session!.id, new Date().toISOString()).run();
      return v2Reply({ url: payload.url, session_id: payload.id });
    }

    // Konto: zamówienia i własne materiały.
    if (path === '/api/v2/account/orders' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const rows = await env.DB.prepare('SELECT o.id,o.order_number,COALESCE(d.display_number,o.order_number) AS display_order_number,o.status,o.total_amount,o.currency,o.created_at,o.updated_at FROM orders o LEFT JOIN order_display_numbers d ON d.order_id=o.id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 100').bind(gate.session!.id).all();
      const items = await env.DB.prepare('SELECT i.order_id,i.product_key,i.product_title,i.product_type,i.quantity,i.unit_amount FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=? ORDER BY i.created_at DESC LIMIT 300').bind(gate.session!.id).all();
      return v2Reply({ orders: rows.results, items: items.results });
    }
    if (path === '/api/v2/account/materials' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const rows = await env.DB.prepare("SELECT e.id,e.product_key,e.product_title,e.product_type,e.access_status,e.created_at,p.description,p.is_published FROM user_entitlements e LEFT JOIN products p ON p.product_key=e.product_key WHERE e.user_id=? AND e.access_status='active' ORDER BY e.created_at DESC").bind(gate.session!.id).all();
      return v2Reply({ materials: rows.results });
    }

    // Plany użytkownika: dowolna liczba planów, dni i ćwiczeń.
    if (path === '/api/v2/training/plans' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const plans = await env.DB.prepare('SELECT id,name,description,created_at,updated_at FROM training_plans_v2 WHERE user_id=? ORDER BY updated_at DESC').bind(gate.session!.id).all<{ id: string; name: string; description: string; created_at: string; updated_at: string }>();
      const output = [] as Array<Record<string, unknown>>;
      for (const plan of plans.results) {
        const days = await env.DB.prepare('SELECT id,day_key,title,sort_order FROM training_plan_days_v2 WHERE plan_id=? ORDER BY sort_order,day_key').bind(plan.id).all<{ id: string; day_key: string; title: string; sort_order: number }>();
        const dayOutput = [] as Array<Record<string, unknown>>;
        for (const day of days.results) {
          const exercises = await env.DB.prepare('SELECT id,name,sort_order,target_sets,target_reps,target_weight_kg,notes FROM training_plan_exercises_v2 WHERE day_id=? ORDER BY sort_order').bind(day.id).all<{ id: string; name: string; sort_order: number; target_sets: number; target_reps: number; target_weight_kg: number | null; notes: string }>();
          dayOutput.push({ ...day, exercises: exercises.results.map(ex => ({ id: ex.id, name: ex.name, sort_order: ex.sort_order, sets: ex.target_sets, reps: ex.target_reps, weight_kg: ex.target_weight_kg, notes: ex.notes })) });
        }
        output.push({ ...plan, days: dayOutput });
      }
      const legacy = await env.DB.prepare('SELECT day_key,title,exercises_json,updated_at FROM training_plan_days WHERE user_id=? ORDER BY day_key').bind(gate.session!.id).all();
      return v2Reply({ plans: output, legacy: legacy.results });
    }
    if (path === '/api/v2/training/plans' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const b = await v2Body(request), name = v2Field(b, 'name', 120), description = v2Field(b, 'description', 1000);
      if (name.length < 2) return v2Reply({ error: 'Nazwa planu musi mieć co najmniej 2 znaki.' }, 400);
      const now = new Date().toISOString(), id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO training_plans_v2(id,user_id,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id, gate.session!.id, name, description, now, now).run();
      return v2Reply({ ok: true, plan: { id, name, description, created_at: now, updated_at: now, days: [] } }, 201);
    }
    const planMatch = path.match(/^\/api\/v2\/training\/plans\/([a-f0-9-]+)$/i);
    if (planMatch && ['PUT', 'DELETE'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const plan = await env.DB.prepare('SELECT id,name,description FROM training_plans_v2 WHERE id=? AND user_id=?').bind(planMatch[1], gate.session!.id).first<{ id: string; name: string; description: string }>();
      if (!plan) return v2Reply({ error: 'Nie znaleziono planu.' }, 404);
      if (method === 'DELETE') { await env.DB.prepare('DELETE FROM training_plan_exercises_v2 WHERE day_id IN (SELECT id FROM training_plan_days_v2 WHERE plan_id=?)').bind(plan.id).run(); await env.DB.prepare('DELETE FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id).run(); await env.DB.prepare('DELETE FROM training_plans_v2 WHERE id=? AND user_id=?').bind(plan.id, gate.session!.id).run(); return v2Reply({ ok: true }); }
      const b = await v2Body(request), name = v2Field(b, 'name', 120), description = v2Field(b, 'description', 1000), rawDays = Array.isArray(b.days) ? b.days : [];
      if (name.length < 2 || rawDays.length > 14) return v2Reply({ error: 'Sprawdź nazwę planu i liczbę dni (maksymalnie 14).' }, 400);
      const normalized: Array<{ day_key: string; title: string; exercises: Array<{ name: string; sets: number; reps: number; weight_kg: number | null; notes: string }> }> = [];
      for (const raw of rawDays) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return v2Reply({ error: 'Nieprawidłowy dzień planu.' }, 400);
        const d = raw as Record<string, unknown>, dayKey = typeof d.day_key === 'string' ? d.day_key.trim().slice(0, 30) : '', title = typeof d.title === 'string' ? d.title.trim().slice(0, 120) : '', rawExercises = Array.isArray(d.exercises) ? d.exercises : [];
        if (!title || !dayKey || rawExercises.length > 40) return v2Reply({ error: 'Każdy dzień musi mieć nazwę i maksymalnie 40 ćwiczeń.' }, 400);
        const exercises: Array<{ name: string; sets: number; reps: number; weight_kg: number | null; notes: string }> = [];
        for (const value of rawExercises) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return v2Reply({ error: 'Nieprawidłowe ćwiczenie.' }, 400);
          const x = value as Record<string, unknown>, exerciseName = typeof x.name === 'string' ? x.name.trim() : '', sets = Number(x.sets ?? 3), reps = Number(x.reps ?? 10), weight = x.weight_kg === '' || x.weight_kg == null ? null : Number(x.weight_kg), notes = typeof x.notes === 'string' ? x.notes.slice(0, 500) : '';
          if (!exerciseName || exerciseName.length > 120 || !Number.isInteger(sets) || sets < 1 || sets > 30 || !Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź nazwę ćwiczenia, serie, powtórzenia i ciężar.' }, 400);
          exercises.push({ name: exerciseName, sets, reps, weight_kg: weight, notes });
        }
        normalized.push({ day_key: dayKey, title, exercises });
      }
      const now = new Date().toISOString();
      await env.DB.prepare('UPDATE training_plans_v2 SET name=?,description=?,updated_at=? WHERE id=? AND user_id=?').bind(name, description, now, plan.id, gate.session!.id).run();
      const oldDays = await env.DB.prepare('SELECT id FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id).all<{ id: string }>();
      const statements: D1PreparedStatement[] = [];
      if (oldDays.results.length) { for (const day of oldDays.results) statements.push(env.DB.prepare('DELETE FROM training_plan_exercises_v2 WHERE day_id=?').bind(day.id)); statements.push(env.DB.prepare('DELETE FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id)); }
      normalized.forEach((day, di) => {
        const dayId = crypto.randomUUID(); statements.push(env.DB.prepare('INSERT INTO training_plan_days_v2(id,plan_id,day_key,title,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(dayId, plan.id, day.day_key, day.title, di, now, now));
        day.exercises.forEach((ex, ei) => statements.push(env.DB.prepare('INSERT INTO training_plan_exercises_v2(id,day_id,name,sort_order,target_sets,target_reps,target_weight_kg,notes) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), dayId, ex.name, ei, ex.sets, ex.reps, ex.weight_kg, ex.notes)));
      });
      if (statements.length) await env.DB.batch(statements);
      return v2Reply({ ok: true, updated_at: now });
    }

    // Roboczy trening jest zapisywany po stronie serwera i wraca po odświeżeniu.
    if (path === '/api/v2/training/draft' && ['GET', 'PUT', 'DELETE'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT draft_json,updated_at FROM training_session_drafts WHERE user_id=?').bind(gate.session!.id).first<{ draft_json: string; updated_at: string }>();
        let draft: unknown = null; try { draft = row ? JSON.parse(row.draft_json) : null; } catch { draft = null; }
        return v2Reply({ draft, updated_at: row?.updated_at || null });
      }
      if (method === 'DELETE') { await env.DB.prepare('DELETE FROM training_session_drafts WHERE user_id=?').bind(gate.session!.id).run(); return v2Reply({ ok: true }); }
      const b = await v2Body(request), draft = b.draft;
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return v2Reply({ error: 'Nieprawidłowy zapis roboczy.' }, 400);
      const json = JSON.stringify(draft); if (json.length > 100_000) return v2Reply({ error: 'Zapis roboczy jest zbyt duży.' }, 413);
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO training_session_drafts(user_id,draft_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET draft_json=excluded.draft_json,updated_at=excluded.updated_at').bind(gate.session!.id, json, now).run();
      return v2Reply({ ok: true, updated_at: now });
    }
    if (path === '/api/v2/training/sessions' && ['GET', 'POST'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (method === 'GET') { const rows = await env.DB.prepare('SELECT id,title,performed_on,notes,exercises_json,created_at FROM workout_sessions WHERE user_id=? ORDER BY performed_on DESC,created_at DESC LIMIT 200').bind(gate.session!.id).all(); return v2Reply({ sessions: rows.results }); }
      const b = await v2Body(request), title = v2Field(b, 'title', 120), performed = v2Field(b, 'performed_on', 10), notes = v2Field(b, 'notes', 1000), raw = Array.isArray(b.exercises) ? b.exercises : [];
      if (title.length < 2 || !v2ValidateDate(performed) || raw.length < 1 || raw.length > 40) return v2Reply({ error: 'Sprawdź nazwę, datę i liczbę ćwiczeń (1–40).' }, 400);
      const exercises: Array<Record<string, unknown>> = [];
      for (const value of raw) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return v2Reply({ error: 'Nieprawidłowe ćwiczenie.' }, 400);
        const x = value as Record<string, unknown>, name = typeof x.name === 'string' ? x.name.trim() : '', sets = Array.isArray(x.sets_detail) ? x.sets_detail : null;
        if (!name || name.length > 120) return v2Reply({ error: 'Każde ćwiczenie musi mieć nazwę.' }, 400);
        if (sets) {
          if (sets.length < 1 || sets.length > 40) return v2Reply({ error: 'Ćwiczenie musi mieć od 1 do 40 serii.' }, 400);
          for (const sv of sets) { if (!sv || typeof sv !== 'object' || Array.isArray(sv)) return v2Reply({ error: 'Nieprawidłowa seria.' }, 400); const set = sv as Record<string, unknown>, reps = Number(set.reps), weight = set.weight_kg === '' || set.weight_kg == null ? null : Number(set.weight_kg); if (!Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź powtórzenia i ciężar w serii.' }, 400); }
          const validSets = sets.map((sv) => { const set = sv as Record<string, unknown>; return { reps: Number(set.reps), weight_kg: set.weight_kg === '' || set.weight_kg == null ? null : Number(set.weight_kg) }; });
          exercises.push({ name, sets: validSets.length, reps: validSets[0]?.reps || 1, weight_kg: validSets[0]?.weight_kg ?? null, sets_detail: validSets });
        } else {
          const setCount = Number(x.sets), reps = Number(x.reps), weight = x.weight_kg == null ? null : Number(x.weight_kg);
          if (!Number.isInteger(setCount) || setCount < 1 || setCount > 40 || !Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź serie, powtórzenia i ciężar.' }, 400);
          exercises.push({ name, sets: setCount, reps, weight_kg: weight });
        }
      }
      const id = crypto.randomUUID(), now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO workout_sessions(id,user_id,title,performed_on,notes,exercises_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, gate.session!.id, title, performed, notes, JSON.stringify(exercises), now, now).run();
      await env.DB.prepare('DELETE FROM training_session_drafts WHERE user_id=?').bind(gate.session!.id).run();
      return v2Reply({ ok: true, id, created_at: now, exercises }, 201);
    }

    // Cele i pomiary: wyłącznie realne dane zapisane dla zalogowanego konta.
    if (path === '/api/v2/progress' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const [sessions, goal, measurements] = await Promise.all([
        env.DB.prepare('SELECT id,title,performed_on,exercises_json,created_at FROM workout_sessions WHERE user_id=? ORDER BY performed_on DESC,created_at DESC LIMIT 200').bind(gate.session!.id).all<{ id: string; title: string; performed_on: string; exercises_json: string; created_at: string }>(),
        env.DB.prepare('SELECT goal_title,target_date,target_value,current_value,unit,notes,updated_at FROM user_goals WHERE user_id=?').bind(gate.session!.id).first(),
        env.DB.prepare('SELECT id,measured_on,weight_kg,waist_cm,bodyfat_percent,notes,created_at FROM user_measurements WHERE user_id=? ORDER BY measured_on DESC LIMIT 200').bind(gate.session!.id).all(),
      ]);
      const weekly: Record<string, number> = {}, records: Record<string, { weight: number; date: string; reps: number }> = {};
      for (const s of sessions.results) {
        const date = s.performed_on || s.created_at.slice(0, 10), monday = (() => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })(); weekly[monday] = (weekly[monday] || 0) + 1;
        try { const items = JSON.parse(s.exercises_json) as Array<Record<string, unknown>>; for (const x of items) { const name = String(x.name || '').trim(); const setList = Array.isArray(x.sets_detail) ? x.sets_detail as Array<Record<string, unknown>> : []; const fallbackWeight = Number(x.weight_kg || 0); for (const set of setList) { if (set.weight_kg === null || set.weight_kg === undefined || set.weight_kg === '') continue; const weight = Number(set.weight_kg), reps = Number(set.reps || 0); if (name && Number.isFinite(weight) && weight >= 0 && reps > 0 && (!records[name] || weight > records[name].weight || (weight === records[name].weight && reps > records[name].reps))) records[name] = { weight, reps, date }; } if (!setList.length && name && fallbackWeight > 0 && (!records[name] || fallbackWeight > records[name].weight)) records[name] = { weight: fallbackWeight, reps: Number(x.reps || 0), date }; } } catch { /* starszy wpis może mieć inny format */ }
      }
      return v2Reply({ session_count: sessions.results.length, weekly, records, sessions: sessions.results.slice(0, 50), goal: goal || null, measurements: measurements.results });
    }
    if (path === '/api/v2/progress/goal' && ['GET', 'PUT', 'DELETE'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (method === 'GET') return v2Reply({ goal: await env.DB.prepare('SELECT goal_title,target_date,target_value,current_value,unit,notes,updated_at FROM user_goals WHERE user_id=?').bind(gate.session!.id).first() || null });
      if (method === 'DELETE') { await env.DB.prepare('DELETE FROM user_goals WHERE user_id=?').bind(gate.session!.id).run(); return v2Reply({ ok: true }); }
      const b = await v2Body(request), title = v2Field(b, 'goal_title', 160), date = v2Field(b, 'target_date', 10), target = b.target_value == null || b.target_value === '' ? null : Number(b.target_value), current = b.current_value == null || b.current_value === '' ? null : Number(b.current_value), unit = v2Field(b, 'unit', 32), notes = v2Field(b, 'notes', 800);
      if (title.length < 2 || (date && !v2ValidateDate(date)) || (target !== null && !Number.isFinite(target)) || (current !== null && !Number.isFinite(current))) return v2Reply({ error: 'Sprawdź tytuł, datę i wartości celu.' }, 400);
      const now = new Date().toISOString(); await env.DB.prepare('INSERT INTO user_goals(user_id,goal_title,target_date,target_value,current_value,unit,notes,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET goal_title=excluded.goal_title,target_date=excluded.target_date,target_value=excluded.target_value,current_value=excluded.current_value,unit=excluded.unit,notes=excluded.notes,updated_at=excluded.updated_at').bind(gate.session!.id, title, date || null, target, current, unit, notes, now).run();
      return v2Reply({ ok: true, updated_at: now });
    }
    if (path === '/api/v2/progress/measurements' && ['GET', 'POST', 'DELETE'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (method === 'GET') { const rows = await env.DB.prepare('SELECT id,measured_on,weight_kg,waist_cm,bodyfat_percent,notes,created_at FROM user_measurements WHERE user_id=? ORDER BY measured_on DESC LIMIT 200').bind(gate.session!.id).all(); return v2Reply({ measurements: rows.results }); }
      if (method === 'DELETE') { const b = await v2Body(request), id = v2Field(b, 'id', 64); await env.DB.prepare('DELETE FROM user_measurements WHERE id=? AND user_id=?').bind(id, gate.session!.id).run(); return v2Reply({ ok: true }); }
      const b = await v2Body(request), date = v2Field(b, 'measured_on', 10), weight = b.weight_kg == null || b.weight_kg === '' ? null : Number(b.weight_kg), waist = b.waist_cm == null || b.waist_cm === '' ? null : Number(b.waist_cm), fat = b.bodyfat_percent == null || b.bodyfat_percent === '' ? null : Number(b.bodyfat_percent), notes = v2Field(b, 'notes', 500);
      if (!v2ValidateDate(date) || [weight, waist, fat].some((v) => v !== null && !Number.isFinite(v)) || (weight !== null && (weight < 20 || weight > 400)) || (waist !== null && (waist < 20 || waist > 300)) || (fat !== null && (fat < 1 || fat > 80))) return v2Reply({ error: 'Sprawdź datę i zakres pomiarów.' }, 400);
      if (weight === null && waist === null && fat === null && !notes.trim()) return v2Reply({ error: 'Zapisz przynajmniej jeden pomiar albo notatkę.' }, 400);
      const now = new Date().toISOString(), id = crypto.randomUUID(); await env.DB.prepare('INSERT INTO user_measurements(id,user_id,measured_on,weight_kg,waist_cm,bodyfat_percent,notes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, gate.session!.id, date, weight, waist, fat, notes, now).run();
      return v2Reply({ ok: true, id }, 201);
    }

    // Pomoc — zgłoszenia użytkownika trafiają do trwałej tabeli, nie giną po wysłaniu formularza.
    if (path === '/api/v2/help/tickets' && ['GET', 'POST'].includes(method)) {
      const session = await v2Session(request, env);
      if (method === 'GET') { if (!session) return v2Reply({ error: 'Zaloguj się, aby zobaczyć swoje zgłoszenia.' }, 401); const rows = await env.DB.prepare('SELECT id,topic,subject,message,order_id,status,admin_note,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(session.id).all(); return v2Reply({ tickets: rows.results }); }
      const b = await v2Body(request), email = session?.email || v2Field(b, 'email', 254).toLowerCase(), topic = v2Field(b, 'topic', 40) || 'other', subject = v2Field(b, 'subject', 160), message = v2Field(b, 'message', 4000), orderId = v2Field(b, 'order_id', 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length < 3 || message.length < 8) return v2Reply({ error: 'Podaj poprawny e-mail, temat i opis problemu (min. 8 znaków).' }, 400);
      if (!['payment', 'access', 'product', 'account', 'other'].includes(topic)) return v2Reply({ error: 'Wybierz prawidłowy temat zgłoszenia.' }, 400);
      if (orderId) {
        if (!session) return v2Reply({ error: 'Zaloguj się, aby powiązać zgłoszenie z zamówieniem.' }, 401);
        const ownedOrder = await env.DB.prepare('SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1').bind(orderId, session.id).first<{ id: string }>();
        if (!ownedOrder) return v2Reply({ error: 'Nie znaleziono Twojego zamówienia o podanym identyfikatorze.' }, 404);
      }
      const id = crypto.randomUUID(), now = new Date().toISOString(); await env.DB.prepare("INSERT INTO support_tickets(id,user_id,email,topic,subject,message,order_id,status,admin_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open','',?,?)").bind(id, session?.id || null, email, topic, subject, message, orderId || null, now, now).run();
      return v2Reply({ ok: true, id, status: 'open' }, 201);
    }

    // Każda ścieżka ACP jest weryfikowana po stronie Workera.
    if (path.startsWith('/api/v2/admin/')) {
      const gate = await v2Gate(request, env, true); if (gate.response) return gate.response;
      const replacementFileMatch = path.match(/^\/api\/v2\/admin\/products\/([a-z0-9-]+)\/file$/);
      if (replacementFileMatch && method === 'POST') {
        if (!env.PRODUCT_FILES) return v2Reply({ error: 'Magazyn plików R2 nie jest skonfigurowany.' }, 503);
        const key = replacementFileMatch[1], item = await v2Product(env, key);
        if (!item) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
        const form = await request.formData(), file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > V2_MAX_FILE) return v2Reply({ error: 'Wybierz plik produktu o rozmiarze do 25 MB.' }, 400);
        const original = v2SafeFilename(file.name), ext = original.toLowerCase().split('.').pop() || '';
        const mime: Record<string,string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip', csv: 'text/csv', txt: 'text/plain' };
        if (!mime[ext]) return v2Reply({ error: 'Dozwolone formaty: PDF, XLSX, DOCX, ZIP, CSV i TXT.' }, 400);
        const fileKey = `products/${crypto.randomUUID()}/${original}`, now = new Date().toISOString();
        await env.PRODUCT_FILES.put(fileKey, await file.arrayBuffer(), { httpMetadata: { contentType: mime[ext], cacheControl: 'private, no-store' } });
        try {
          await env.DB.prepare('UPDATE products SET file_key=?,original_filename=?,file_content_type=?,updated_at=? WHERE product_key=?').bind(fileKey, original, mime[ext], now, key).run();
        } catch (error) {
          await env.PRODUCT_FILES.delete(fileKey);
          throw error;
        }
        // Nie usuwamy poprzedniego obiektu R2 automatycznie: starsze materiały zakupione pozostają możliwe do archiwizacji.
        return v2Reply({ ok: true, original_filename: original });
      }
      if (path === '/api/v2/admin/covers' && method === 'POST') {
        if (!env.PRODUCT_FILES) return v2Reply({ error: 'Magazyn plików R2 nie jest skonfigurowany.' }, 503);
        const form = await request.formData(), key = String(form.get('product_key') || '').trim().toLowerCase(), file = form.get('file');
        const product = await v2Product(env, key); if (!product) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
        if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) return v2Reply({ error: 'Wybierz okładkę o rozmiarze do 4 MB.' }, 400);
        const ext = file.name.toLowerCase().split('.').pop() || '';
        const allowed: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' };
        if (!allowed[ext]) return v2Reply({ error: 'Okładka musi być w formacie PNG, JPG, WebP lub AVIF.' }, 400);
        const coverKey = `covers/${crypto.randomUUID()}/${v2SafeFilename(file.name)}`, contentType = allowed[ext];
        await env.PRODUCT_FILES.put(coverKey, await file.arrayBuffer(), { httpMetadata: { contentType, cacheControl: 'public, max-age=3600' } });
        const meta = await env.DB.prepare('SELECT category_slug,target_audience,contents_json FROM product_metadata WHERE product_key=?').bind(key).first<{ category_slug: string; target_audience: string; contents_json: string }>();
        await env.DB.prepare('INSERT INTO product_metadata(product_key,category_slug,target_audience,contents_json,cover_key,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(product_key) DO UPDATE SET cover_key=excluded.cover_key,updated_at=excluded.updated_at').bind(key, meta?.category_slug || 'inne', meta?.target_audience || '', meta?.contents_json || '[]', coverKey, new Date().toISOString()).run();
        return v2Reply({ ok: true, cover_key: coverKey });
      }
      if (path === '/api/v2/admin/grant-access' && method === 'POST') {
        const b = await v2Body(request), email = v2Field(b, 'email', 254).toLowerCase(), key = v2Field(b, 'product_key', 100).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !key) return v2Reply({ error: 'Podaj poprawny e-mail oraz produkt.' }, 400);
        const target = await env.DB.prepare('SELECT id,email FROM users WHERE email=? LIMIT 1').bind(email).first<{ id: string; email: string }>();
        if (!target) return v2Reply({ error: 'Nie znaleziono konta o takim adresie e-mail.' }, 404);
        const product = await v2Product(env, key); if (!product) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
        const existing = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(target.id, key).first<{ id: string }>();
        const now = new Date().toISOString(), id = existing?.id || crypto.randomUUID();
        const statements: D1PreparedStatement[] = [];
        if (!existing) statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES(?,?,NULL,?,?,?,'active',?)").bind(id, target.id, key, product.title, product.product_type, now));
        let componentCount = 0;
        if (product.product_type === 'bundle') {
          const components = await env.DB.prepare('SELECT p.product_key,p.title,p.product_type FROM bundle_items b JOIN products p ON p.product_key=b.component_product_key WHERE b.bundle_key=? AND p.is_published=1 ORDER BY b.sort_order,b.component_product_key').bind(key).all<{ product_key: string; title: string; product_type: string }>();
          componentCount = components.results.length;
          for (const component of components.results) statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?, ?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), target.id, null, component.product_key, component.title, component.product_type, now, target.id, component.product_key));
        }
        if (!existing) statements.push(env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), gate.session!.id, gate.session!.email, 'grant_access', 'user_entitlement', id, JSON.stringify({ target_email: target.email, product_key: key, bundle_components: componentCount }), now));
        if (statements.length) await env.DB.batch(statements);
        return v2Reply({ ok: true, already_active: Boolean(existing), bundle_components: componentCount }, existing ? 200 : 201);
      }
      if (path === '/api/v2/admin/overview' && method === 'GET') {
        const [sales, orders, users, products, tickets, promos] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(total_amount),0) AS revenue FROM orders WHERE status IN ('paid','fulfilled','processing')").first(),
          env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE created_at>=datetime('now','-30 days')").first(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(), env.DB.prepare('SELECT COUNT(*) AS count FROM products WHERE is_published=1').first(),
          env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open','in_progress')").first(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM promotion_codes WHERE is_active=1').first(),
        ]);
        const recent = await env.DB.prepare('SELECT o.id,o.user_id,u.email,o.order_number,COALESCE(d.display_number,o.order_number) AS display_order_number,o.status,o.total_amount,o.currency,o.created_at FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_display_numbers d ON d.order_id=o.id ORDER BY o.created_at DESC LIMIT 8').all();
        return v2Reply({ sales: sales || {}, last_30_days_orders: orders, users, products, open_tickets: tickets, active_promotions: promos, recent_orders: recent.results });
      }
      if (path === '/api/v2/admin/products' && method === 'GET') {
        const rows = await env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.original_filename,p.file_key,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key ORDER BY p.created_at DESC").all();
        const components = await env.DB.prepare('SELECT bundle_key,component_product_key,quantity,sort_order FROM bundle_items ORDER BY bundle_key,sort_order').all();
        let categories = await env.DB.prepare('SELECT slug,title,description,is_active,sort_order FROM product_categories ORDER BY sort_order,title').all();
        return v2Reply({ products: rows.results, components: components.results, categories: categories.results });
      }
      const adminProductMatch = path.match(/^\/api\/v2\/admin\/products\/([a-z0-9-]+)$/);
      if (adminProductMatch && ['PATCH', 'PUT'].includes(method)) {
        const key = adminProductMatch[1], item = await v2Product(env, key); if (!item) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
        const b = await v2Body(request), existingMeta = await env.DB.prepare('SELECT category_slug,target_audience,contents_json FROM product_metadata WHERE product_key=?').bind(key).first<{ category_slug: string; target_audience: string; contents_json: string }>(), title = b.title === undefined ? item.title : v2Field(b, 'title', 140), description = b.description === undefined ? item.description : v2Field(b, 'description', 4000), type = b.product_type === undefined ? item.product_type : v2Field(b, 'product_type', 40), price = b.price_amount === undefined ? item.price_amount : Number(b.price_amount), free = b.is_free === undefined ? Boolean(item.is_free) : b.is_free === true, published = b.is_published === undefined ? Boolean(item.is_published) : b.is_published === true, category = b.category_slug === undefined ? (existingMeta?.category_slug || 'inne') : v2Field(b, 'category_slug', 60), audience = b.target_audience === undefined ? (existingMeta?.target_audience || '') : v2Field(b, 'target_audience', 500), contents = Array.isArray(b.contents) ? b.contents.filter((x) => typeof x === 'string').slice(0, 50) : undefined;
        if (title.length < 2 || description.length > 4000 || !['ebook', 'training_plan', 'guide', 'bundle', 'other'].includes(type) || !Number.isFinite(price) || price < 0 || price > 100000 || (published && !free && price <= 0)) return v2Reply({ error: 'Sprawdź nazwę, opis, typ, cenę i status publikacji.' }, 400);
        if (category && !(await env.DB.prepare('SELECT slug FROM product_categories WHERE slug=? AND is_active=1').bind(category).first())) return v2Reply({ error: 'Wybierz istniejącą kategorię.' }, 400);
        await env.DB.prepare('UPDATE products SET title=?,description=?,product_type=?,price_amount=?,is_free=?,is_published=?,updated_at=? WHERE product_key=?').bind(title, description, type, free ? 0 : price, free ? 1 : 0, published ? 1 : 0, new Date().toISOString(), key).run();
        const now = new Date().toISOString(); await env.DB.prepare('INSERT INTO product_metadata(product_key,category_slug,target_audience,contents_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(product_key) DO UPDATE SET category_slug=excluded.category_slug,target_audience=excluded.target_audience,contents_json=COALESCE(?,product_metadata.contents_json),updated_at=excluded.updated_at').bind(key, category || 'inne', audience, JSON.stringify(contents || []), now, contents === undefined ? null : JSON.stringify(contents)).run();
        if (type === 'bundle' && Array.isArray(b.components)) {
          const components = b.components.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,100}$/.test(x)).slice(0, 50);
          await env.DB.prepare('DELETE FROM bundle_items WHERE bundle_key=?').bind(key).run();
          for (let i = 0; i < components.length; i++) { if (components[i] === key) continue; if (await v2Product(env, components[i])) await env.DB.prepare('INSERT OR IGNORE INTO bundle_items(bundle_key,component_product_key,quantity,sort_order,created_at) VALUES(?,?,1,?,?)').bind(key, components[i], i, now).run(); }
        }
        return v2Reply({ ok: true });
      }
      if (path === '/api/v2/admin/categories' && method === 'POST') {
        const b = await v2Body(request), slug = v2Field(b, 'slug', 60).toLowerCase(), title = v2Field(b, 'title', 100), description = v2Field(b, 'description', 500);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || title.length < 2) return v2Reply({ error: 'Nieprawidłowy klucz lub nazwa kategorii.' }, 400);
        await env.DB.prepare('INSERT INTO product_categories(slug,title,description,sort_order,is_active,created_at) VALUES(?,?,?,100,1,?)').bind(slug, title, description, new Date().toISOString()).run(); return v2Reply({ ok: true }, 201);
      }
      if (path === '/api/v2/admin/orders' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 200), status = (url.searchParams.get('status') || '').trim();
        const from = (url.searchParams.get('from') || '').trim(), to = (url.searchParams.get('to') || '').trim();
        if ((from && !v2ValidateDate(from)) || (to && !v2ValidateDate(to))) return v2Reply({ error: 'Filtr daty musi używać formatu RRRR-MM-DD.' }, 400);
        const allowedStatuses = ['', 'pending', 'paid', 'processing', 'fulfilled', 'canceled', 'refunded'];
        if (!allowedStatuses.includes(status)) return v2Reply({ error: 'Nieprawidłowy status zamówienia.' }, 400);
        if (from && to && from > to) return v2Reply({ error: 'Data początkowa nie może być późniejsza od końcowej.' }, 400);
        const rows = await env.DB.prepare(`SELECT o.id,o.user_id,u.email,o.order_number,COALESCE(d.display_number,o.order_number) AS display_order_number,o.status,o.total_amount,o.currency,o.created_at,o.updated_at FROM orders o JOIN users u ON o.user_id=u.id LEFT JOIN order_display_numbers d ON d.order_id=o.id WHERE (?='' OR o.order_number LIKE '%'||?||'%' OR d.display_number LIKE '%'||?||'%' OR lower(u.email) LIKE '%'||lower(?)||'%') AND (?='' OR o.status=?) AND (?='' OR date(o.created_at)>=date(?)) AND (?='' OR date(o.created_at)<=date(?)) ORDER BY o.created_at DESC LIMIT 250`).bind(q,q,q,q,status,status,from,from,to,to).all();
        const orderIds = rows.results.map((row: Record<string, unknown>) => String(row.id || ''));
        const items = orderIds.length ? await env.DB.prepare(`SELECT i.order_id,i.product_key,i.product_title,i.product_type,i.quantity,i.unit_amount FROM order_items i WHERE i.order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY i.created_at DESC`).bind(...orderIds).all() : { results: [] };
        return v2Reply({ orders: rows.results, items: items.results });
      }
      const userDetailMatch = path.match(/^\/api\/v2\/admin\/users\/([a-f0-9-]+)$/i);
      if (userDetailMatch && method === 'GET') {
        const userId = userDetailMatch[1];
        const user = await env.DB.prepare('SELECT id,email,created_at,updated_at FROM users WHERE id=? LIMIT 1').bind(userId).first<{ id: string; email: string; created_at: string; updated_at: string }>();// No password hash or session token is returned.
        if (!user) return v2Reply({ error: 'Nie znaleziono użytkownika.' }, 404);
        const [profile, orders, entitlements, workouts, tickets, items] = await Promise.all([
          env.DB.prepare('SELECT first_name,gender,weight_kg,height_cm,training_location,primary_goal,training_days_per_week,created_at,updated_at FROM user_profiles WHERE user_id=? LIMIT 1').bind(userId).first(),
          env.DB.prepare('SELECT o.id,o.order_number,COALESCE(d.display_number,o.order_number) AS display_order_number,o.status,o.total_amount,o.currency,o.created_at,o.updated_at FROM orders o LEFT JOIN order_display_numbers d ON d.order_id=o.id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 100').bind(userId).all(),
          env.DB.prepare("SELECT id,product_key,product_title,product_type,access_status,created_at FROM user_entitlements WHERE user_id=? ORDER BY created_at DESC LIMIT 200").bind(userId).all(),
          env.DB.prepare('SELECT id,title,performed_on,created_at FROM workout_sessions WHERE user_id=? ORDER BY performed_on DESC,created_at DESC LIMIT 20').bind(userId).all(),
          env.DB.prepare('SELECT id,topic,subject,status,order_id,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all(),
          env.DB.prepare('SELECT i.order_id,i.product_key,i.product_title,i.product_type,i.quantity,i.unit_amount FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=? ORDER BY i.created_at DESC LIMIT 300').bind(userId).all(),
        ]);
        return v2Reply({ user, profile: profile || null, orders: orders.results, entitlements: entitlements.results, recent_workouts: workouts.results, tickets: tickets.results, items: items.results });
      }
      if (path === '/api/v2/admin/users' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 180);
        const rows = await env.DB.prepare(`SELECT u.id,u.email,u.created_at,COUNT(DISTINCT o.id) AS order_count,COALESCE(SUM(CASE WHEN o.status IN ('paid','fulfilled','processing') THEN o.total_amount ELSE 0 END),0) AS paid_total,COUNT(DISTINCT e.id) AS access_count FROM users u LEFT JOIN orders o ON o.user_id=u.id LEFT JOIN user_entitlements e ON e.user_id=u.id WHERE (?='' OR lower(u.email) LIKE '%'||lower(?)||'%') GROUP BY u.id ORDER BY u.created_at DESC LIMIT 250`).bind(q,q).all();
        return v2Reply({ users: rows.results });
      }
      if (path === '/api/v2/admin/payments' && method === 'GET') {
        const [legacyEvents, diagnostics, failed] = await Promise.all([
          env.DB.prepare('SELECT event_id,event_type,received_at FROM stripe_webhook_events ORDER BY received_at DESC LIMIT 200').all<{ event_id: string; event_type: string; received_at: string }>(),
          env.DB.prepare('SELECT event_id,event_type,status,error_message,checkout_session_id,order_id,received_at,processed_at FROM stripe_webhook_diagnostics ORDER BY received_at DESC LIMIT 200').all<{ event_id: string; event_type: string; status: string; error_message: string; checkout_session_id: string; order_id: string; received_at: string; processed_at: string | null }>(),
          env.DB.prepare("SELECT id,user_id,order_number,status,total_amount,currency,created_at,updated_at FROM orders WHERE status IN ('pending','canceled','refunded') ORDER BY created_at DESC LIMIT 100").all(),
        ]);
        const byId = new Map<string, Record<string, unknown>>();
        for (const row of legacyEvents.results) byId.set(row.event_id, { ...row, status: 'processed', error_message: '' });
        for (const row of diagnostics.results) byId.set(row.event_id, row as unknown as Record<string, unknown>);
        const events = [...byId.values()].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at))).slice(0, 200);
        return v2Reply({ events, attention_orders: failed.results });
      }
      if (path === '/api/v2/admin/promotions' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,code,discount_type,discount_value,starts_at,ends_at,max_uses,used_count,product_key,is_active,created_at,updated_at FROM promotion_codes ORDER BY created_at DESC LIMIT 250').all(); return v2Reply({ promotions: rows.results });
      }
      if (path === '/api/v2/admin/promotions' && method === 'POST') {
        const b = await v2Body(request), code = v2Field(b, 'code', 80).replace(/\s+/g, '').toUpperCase(), type = v2Field(b, 'discount_type', 20), value = Number(b.discount_value), starts = v2Field(b, 'starts_at', 30), ends = v2Field(b, 'ends_at', 30), maxUses = b.max_uses == null || b.max_uses === '' ? null : Number(b.max_uses), productKey = v2Field(b, 'product_key', 100);
        if (!/^[A-Z0-9_-]{3,80}$/.test(code) || !['percent', 'fixed'].includes(type) || !Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100) || (type === 'fixed' && value > 100000) || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) || (starts && Number.isNaN(Date.parse(starts)) || ends && Number.isNaN(Date.parse(ends))) || (starts && ends && Date.parse(ends) <= Date.parse(starts))) return v2Reply({ error: 'Sprawdź kod, typ rabatu, wartość, daty oraz limit użyć. Data końca musi być późniejsza od daty początku.' }, 400);
        if (productKey && !(await v2Product(env, productKey))) return v2Reply({ error: 'Nie znaleziono wskazanego produktu.' }, 404);
        const now = new Date().toISOString(), id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO promotion_codes(id,code,discount_type,discount_value,starts_at,ends_at,max_uses,used_count,product_key,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,1,?,?)').bind(id, code, type, value, starts || null, ends || null, maxUses, productKey || null, now, now).run(); return v2Reply({ ok: true, id }, 201);
      }
      const promoMatch = path.match(/^\/api\/v2\/admin\/promotions\/([a-f0-9-]+)$/i);
      if (promoMatch && method === 'PATCH') {
        const b = await v2Body(request), current = await env.DB.prepare('SELECT id,is_active FROM promotion_codes WHERE id=?').bind(promoMatch[1]).first<{ id: string; is_active: number }>(); if (!current) return v2Reply({ error: 'Nie znaleziono kodu.' }, 404);
        const active = b.is_active === undefined ? Boolean(current.is_active) : b.is_active === true; await env.DB.prepare('UPDATE promotion_codes SET is_active=?,updated_at=? WHERE id=?').bind(active ? 1 : 0, new Date().toISOString(), current.id).run(); return v2Reply({ ok: true });
      }
      if (path === '/api/v2/admin/support' && method === 'GET') {
        const status = (url.searchParams.get('status') || '').trim(); const rows = await env.DB.prepare("SELECT id,user_id,email,topic,subject,message,order_id,status,admin_note,created_at,updated_at FROM support_tickets WHERE (?='' OR status=?) ORDER BY created_at DESC LIMIT 300").bind(status,status).all(); return v2Reply({ tickets: rows.results });
      }
      const ticketMatch = path.match(/^\/api\/v2\/admin\/support\/([a-f0-9-]+)$/i);
      if (ticketMatch && method === 'PATCH') {
        const b = await v2Body(request), status = v2Field(b, 'status', 30), note = v2Field(b, 'admin_note', 2000); if (!['open','in_progress','resolved','closed'].includes(status)) return v2Reply({ error: 'Nieprawidłowy status zgłoszenia.' }, 400);
        const now = new Date().toISOString(); await env.DB.prepare('UPDATE support_tickets SET status=?,admin_note=?,updated_at=?,resolved_at=? WHERE id=?').bind(status,note,now,['resolved','closed'].includes(status)?now:null,ticketMatch[1]).run(); return v2Reply({ ok: true });
      }
      if (path === '/api/v2/admin/analytics' && method === 'GET') {
        const events = await env.DB.prepare("SELECT event_type,COUNT(*) AS count FROM product_analytics WHERE created_at>=datetime('now','-30 days') GROUP BY event_type ORDER BY count DESC").all();
        const popular = await env.DB.prepare("SELECT product_key,COUNT(*) AS views FROM product_analytics WHERE event_type='product_view' AND created_at>=datetime('now','-30 days') GROUP BY product_key ORDER BY views DESC LIMIT 20").all();
        const funnel = await env.DB.prepare("SELECT COUNT(DISTINCT CASE WHEN event_type='product_view' THEN session_key END) AS product_visitors,COUNT(DISTINCT CASE WHEN event_type='checkout_started' THEN session_key END) AS checkout_starts,COUNT(DISTINCT CASE WHEN event_type='purchase_confirmed' THEN session_key END) AS confirmations FROM product_analytics WHERE created_at>=datetime('now','-30 days')").first();
        return v2Reply({ events: events.results, popular_products: popular.results, funnel });
      }
      if (path === '/api/v2/admin/settings' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT setting_key,setting_value,updated_at FROM app_settings ORDER BY setting_key').all(); return v2Reply({ settings: rows.results });
      }
      if (path === '/api/v2/admin/settings' && method === 'PUT') {
        const b = await v2Body(request), settings = b.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return v2Reply({ error: 'Nieprawidłowe ustawienia.' }, 400);
        const allowed = ['support_email','store_notice','analytics_enabled']; const now = new Date().toISOString(), statements: D1PreparedStatement[] = [];
        for (const key of allowed) { const value = (settings as Record<string, unknown>)[key]; if (value === undefined) continue; if (typeof value !== 'string' || value.length > 1000) return v2Reply({ error: `Nieprawidłowa wartość ustawienia ${key}.` }, 400); statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind(key,value,now)); }
        if (statements.length) await env.DB.batch(statements); return v2Reply({ ok: true });
      }
      return v2Reply({ error: 'Nie znaleziono endpointu administracyjnego.' }, 404);
    }
    return null;
  } catch (error) {
    if (error instanceof V2InputError) return v2Reply({ error: error.message }, error.status);
    console.error('System Formy V2 API error:', error);
    return v2Reply({ error: 'Wystąpił błąd serwera. Spróbuj ponownie.' }, 500);
  }
}
