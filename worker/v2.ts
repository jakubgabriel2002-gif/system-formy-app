interface V2Env {
  DB: D1Database;
  PRODUCT_FILES?: R2Bucket;
  ADMIN_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  AUTH_PASSWORD_PEPPER?: string;
}
type V2Session = { id: string; email: string };
type V2Body = Record<string, unknown>;
type V2Product = { id: string; product_key: string; title: string; description: string; product_type: string; price_amount: number; currency: string; is_free: number; is_published: number; checkout_url: string | null; file_key: string; original_filename: string; file_content_type: string; created_at: string; updated_at: string };
type V2PromoCandidate = { id: string; code: string; discount_type: string; discount_value: number; max_uses: number | null; used_count: number; product_key: string | null };
class V2InputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const V2_COOKIE = 'sf_session';
const V2_MAX_FILE = 25 * 1024 * 1024;
const V2_GENERATOR_PRODUCT_KEY = 'generator-planu-treningowego';
const V2_INDIVIDUAL_PLAN_PRODUCT_KEY = 'plan-indywidualny';
const V2_GENERATOR_PRICE_CENTS = 2999;
const V2_INDIVIDUAL_PLAN_PRICE_CENTS = 5999;
const V2_INDIVIDUAL_PLAN_PREMIUM_PRICE_CENTS = 4999;
const V2_PREMIUM_MONTHLY_PRICE_CENTS = 5000;
const V2_PREMIUM_YEARLY_PRICE_CENTS = 25000;
const V2_PREMIUM_PRODUCT_DISCOUNT_PERCENT = 20;
const V2_PREMIUM_INCLUDED_CHALLENGE_PRICE_CENTS = 1999;
const V2_PREMIUM_CHALLENGE_PRICE_CENTS = 500;

// Schema setup is idempotent and only needs to run once per D1 binding per Worker isolate.
// Failed setup promises are evicted so the next request can retry instead of caching a failure.
const schemaSetupCache = new WeakMap<object, Map<string, Promise<void>>>();
function ensureSchemaOnce(env: V2Env, key: string, setup: () => Promise<void>): Promise<void> {
  const database = env.DB as object;
  let cache = schemaSetupCache.get(database);
  if (!cache) {
    cache = new Map<string, Promise<void>>();
    schemaSetupCache.set(database, cache);
  }
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = setup().catch((error: unknown) => {
    cache?.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

function ensureIndividualPlanRequestTable(env: V2Env): Promise<void> {
  return ensureSchemaOnce(env, 'individual-plan-requests', () => createIndividualPlanRequestTable(env));
}

function ensurePremiumSubscriptionTable(env: V2Env): Promise<void> {
  return ensureSchemaOnce(env, 'premium-subscriptions', async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS premium_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      plan_key TEXT NOT NULL CHECK(plan_key IN ('monthly','yearly')),
      status TEXT NOT NULL,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_premium_subscriptions_user_status ON premium_subscriptions(user_id,status,current_period_end)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_premium_subscriptions_customer ON premium_subscriptions(stripe_customer_id)').run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS premium_trials (
      user_id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_premium_trials_ends_at ON premium_trials(ends_at)').run();
  });
}

async function v2PremiumTrial(env: V2Env, userId: string): Promise<{ user_id: string; started_at: string; ends_at: string; created_at: string } | null> {
  await ensurePremiumSubscriptionTable(env);
  return env.DB.prepare('SELECT user_id,started_at,ends_at,created_at FROM premium_trials WHERE user_id=? LIMIT 1')
    .bind(userId).first<{ user_id: string; started_at: string; ends_at: string; created_at: string }>();
}

async function v2PremiumSubscription(env: V2Env, userId: string): Promise<{ id:string; user_id:string; stripe_subscription_id:string; stripe_customer_id:string|null; plan_key:string; status:string; current_period_end:string|null; cancel_at_period_end:number; created_at:string; updated_at:string } | null> {
  await ensurePremiumSubscriptionTable(env);
  return env.DB.prepare('SELECT * FROM premium_subscriptions WHERE user_id=? ORDER BY created_at DESC,updated_at DESC LIMIT 1')
    .bind(userId).first<{ id:string; user_id:string; stripe_subscription_id:string; stripe_customer_id:string|null; plan_key:string; status:string; current_period_end:string|null; cancel_at_period_end:number; created_at:string; updated_at:string }>();
}

async function v2IsPremium(env: V2Env, userId: string): Promise<boolean> {
  const subscription = await v2PremiumSubscription(env, userId);
  if (subscription) {
    const activeStatus = subscription.status === 'active' || subscription.status === 'trialing';
    const periodValid = !subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now();
    if (activeStatus && periodValid) return true;
  }

  // Okres próbny jest jednorazowy i nadawany wyłącznie podczas rejestracji nowego konta.
  const trial = await v2PremiumTrial(env, userId);
  const trialActive = Boolean(trial && Number.isFinite(Date.parse(trial.ends_at)) && Date.parse(trial.ends_at) > Date.now());
  if (trialActive) return true;

  // Ręczny dostęp z ACP nadal działa dla kont, które nie mają rekordu subskrypcji.
  if (!subscription) {
    const legacy = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND access_status='active' AND (lower(COALESCE(product_key,'')) LIKE '%premium%' OR lower(COALESCE(product_title,'')) LIKE '%premium%') LIMIT 1")
      .bind(userId).first<{ id:string }>();
    if (legacy) return true;
  }

  // Po wygaśnięciu subskrypcji albo trzydniowego triala odbierz tylko te korzyści,
  // które były przyznane wyłącznie jako abonamentowe wyzwania. Zakupione materiały nie są usuwane.
  if (subscription || trial) {
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE user_entitlements SET access_status='revoked'
      WHERE user_id=? AND access_status='active' AND order_id IN
      (SELECT id FROM orders WHERE user_id=? AND order_number LIKE 'PREMIUM-CHALLENGE-%')`)
      .bind(userId,userId).run().catch(() => {});
    try {
      await env.DB.prepare(`UPDATE sf_challenge_participants SET status='paused_premium',updated_at=?
        WHERE user_id=? AND status='active' AND challenge_id IN (
          SELECT c.id FROM sf_challenges c JOIN order_items i ON i.product_key=c.product_key
          JOIN orders o ON o.id=i.order_id WHERE o.user_id=? AND o.order_number LIKE 'PREMIUM-CHALLENGE-%')`)
        .bind(now,userId,userId).run();
    } catch { /* tabele wyzwań są tworzone leniwie; pozostałe korzyści działają niezależnie */ }
  }
  return false;
}

async function v2UpsertPremiumSubscription(env: V2Env, sub: Record<string, any>, fallback?: { user_id?: string; plan_key?: string; stripe_customer_id?: string | null }): Promise<boolean> {
  await ensurePremiumSubscriptionTable(env);
  const stripeId = typeof sub.id === 'string' ? sub.id : '';
  if (!stripeId) return false;
  const existing = await env.DB.prepare('SELECT user_id,plan_key,stripe_customer_id,created_at FROM premium_subscriptions WHERE stripe_subscription_id=? LIMIT 1')
    .bind(stripeId).first<{ user_id:string; plan_key:string; stripe_customer_id:string|null; created_at:string }>();
  const meta = sub.metadata && typeof sub.metadata === 'object' ? sub.metadata as Record<string, unknown> : {};
  const userId = typeof meta.user_id === 'string' && meta.user_id ? meta.user_id : fallback?.user_id || existing?.user_id || '';
  const rawPlan = typeof meta.plan_key === 'string' ? meta.plan_key : fallback?.plan_key || existing?.plan_key || 'monthly';
  const planKey = rawPlan === 'yearly' ? 'yearly' : rawPlan === 'monthly' ? 'monthly' : existing?.plan_key || fallback?.plan_key || 'monthly';
  if (!userId || !['monthly','yearly'].includes(planKey)) return false;
  const status = typeof sub.status === 'string' ? sub.status : 'incomplete';
  const periodRaw = Number(sub.current_period_end);
  const periodEnd = Number.isFinite(periodRaw) && periodRaw > 0 ? new Date(periodRaw * 1000).toISOString() : null;
  const customer = typeof sub.customer === 'string' ? sub.customer : fallback?.stripe_customer_id || existing?.stripe_customer_id || null;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO premium_subscriptions(id,user_id,stripe_subscription_id,stripe_customer_id,plan_key,status,current_period_end,cancel_at_period_end,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(stripe_subscription_id) DO UPDATE SET
    user_id=excluded.user_id,stripe_customer_id=COALESCE(excluded.stripe_customer_id,premium_subscriptions.stripe_customer_id),
    plan_key=excluded.plan_key,status=excluded.status,current_period_end=COALESCE(excluded.current_period_end,premium_subscriptions.current_period_end),
    cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at`)
    .bind(existing ? crypto.randomUUID() : crypto.randomUUID(), userId, stripeId, customer, planKey, status, periodEnd,
      sub.cancel_at_period_end === true ? 1 : 0, existing?.created_at || now, now).run();
  return true;
}

function v2StripePeriodIso(seconds: unknown): string | null {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

async function v2PremiumStripeEvents(event: Record<string, any>, env: V2Env): Promise<Response | null> {
  const eventId = typeof event.id === 'string' ? event.id : '';
  const eventType = typeof event.type === 'string' ? event.type : '';
  const object = event.data?.object as Record<string, any> | undefined;
  if (!eventId || !object) return null;
  const subscriptionEvent = ['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(eventType);
  const invoiceEvent = eventType === 'invoice.paid' || eventType === 'invoice.payment_failed';
  if (!subscriptionEvent && !invoiceEvent) return null;
  await ensurePremiumSubscriptionTable(env);
  const prior = await env.DB.prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id=? LIMIT 1').bind(eventId).first<{event_id:string}>();
  if (prior) return v2Reply({ received:true, duplicate:true });
  if (subscriptionEvent && object.object === 'subscription') {
    const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};
    const existing = await env.DB.prepare('SELECT user_id,plan_key,stripe_customer_id FROM premium_subscriptions WHERE stripe_subscription_id=? LIMIT 1')
      .bind(String(object.id || '')).first<{user_id:string;plan_key:string;stripe_customer_id:string|null}>();
    const isPremiumSub = metadata.system_formy_premium === '1' || Boolean(existing);
    if (!isPremiumSub) return null;
    let status: Record<string, any> = eventType === 'customer.subscription.deleted' ? { ...object, status:'canceled' } : object;
    // Zdarzenia Stripe nie zawsze przychodzą w kolejności; dla utworzonych i zmienionych subskrypcji pobierz aktualny stan zamiast nadpisywać nowsze dane starym webhookiem.
    if (eventType !== 'customer.subscription.deleted' && env.STRIPE_SECRET_KEY && typeof object.id === 'string') {
      const latestResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(object.id)}`, { headers:{ Authorization:`Bearer ${env.STRIPE_SECRET_KEY}` } });
      if (!latestResponse.ok) return v2Reply({ error:'Nie udało się odświeżyć statusu subskrypcji ze Stripe. Zdarzenie może zostać ponowione.' },502);
      status = await latestResponse.json() as Record<string, any>;
      status.metadata = { ...(status.metadata || {}), system_formy_premium:'1', user_id:existing?.user_id || metadata.user_id, plan_key:existing?.plan_key || metadata.plan_key };
    }
    const saved = await v2UpsertPremiumSubscription(env, status, existing || undefined);
    if (!saved) return v2Reply({ received:true, ignored:true });
    await env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId,eventType,new Date().toISOString()).run();
    return v2Reply({ received:true, subscription_updated:true });
  }
  const subscriptionIdRaw = typeof object.subscription === 'string' ? object.subscription :
    typeof object.parent?.subscription_details?.subscription === 'string' ? object.parent.subscription_details.subscription : '';
  if (!subscriptionIdRaw) return null;
  const existing = await env.DB.prepare('SELECT user_id,plan_key,stripe_customer_id FROM premium_subscriptions WHERE stripe_subscription_id=? LIMIT 1')
    .bind(subscriptionIdRaw).first<{user_id:string;plan_key:string;stripe_customer_id:string|null}>();
  if (!existing) return null;
  if (eventType === 'invoice.payment_failed') {
    await env.DB.prepare("UPDATE premium_subscriptions SET status='past_due',updated_at=? WHERE stripe_subscription_id=?")
      .bind(new Date().toISOString(),subscriptionIdRaw).run();
  } else {
    // Odnowienie po opłaconej fakturze: pobierz aktualny okres i stan bezpośrednio ze Stripe.
    let synced = false;
    if (env.STRIPE_SECRET_KEY) {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionIdRaw)}`, { headers:{ Authorization:`Bearer ${env.STRIPE_SECRET_KEY}` } });
      if (response.ok) {
        const sub = await response.json() as Record<string, any>;
        synced = await v2UpsertPremiumSubscription(env, sub, existing);
      } else {
        return v2Reply({ error:'Nie udało się odświeżyć stanu subskrypcji po płatności. Zdarzenie może zostać ponowione.' },502);
      }
    }
    if (!synced) return v2Reply({ error:'Nie udało się zsynchronizować subskrypcji po płatności. Zdarzenie może zostać ponowione.' },502);
  }
  await env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId,eventType,new Date().toISOString()).run();
  return v2Reply({ received:true, subscription_updated:true });
}

async function createIndividualPlanRequestTable(env: V2Env): Promise<void> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS individual_plan_requests (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, full_name TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL, level TEXT NOT NULL, location TEXT NOT NULL, equipment TEXT NOT NULL,
    days_per_week INTEGER NOT NULL, session_minutes INTEGER NOT NULL, training_history TEXT NOT NULL DEFAULT '',
    schedule TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '', avoid TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'awaiting_questionnaire', admin_note TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'legacy', checkout_session_id TEXT, order_id TEXT,
    training_plan_id TEXT, training_plan_name TEXT, training_plan_description TEXT, training_plan_start_date TEXT,
    training_plan_progression TEXT, training_plan_json TEXT, questionnaire_json TEXT NOT NULL DEFAULT '{}'
  )`).run();

  // D1 databases may already contain an older table created before the paid-order flow existed.
  // CREATE TABLE IF NOT EXISTS doesn't migrate that table, so add missing columns without losing rows.
  const additions: Array<[string, string]> = [
    ['user_id', "TEXT NOT NULL DEFAULT ''"], ['email', "TEXT NOT NULL DEFAULT ''"], ['full_name', "TEXT NOT NULL DEFAULT ''"],
    ['goal', "TEXT NOT NULL DEFAULT ''"], ['level', "TEXT NOT NULL DEFAULT ''"], ['location', "TEXT NOT NULL DEFAULT ''"],
    ['equipment', "TEXT NOT NULL DEFAULT ''"], ['days_per_week', 'INTEGER NOT NULL DEFAULT 3'], ['session_minutes', 'INTEGER NOT NULL DEFAULT 60'],
    ['training_history', "TEXT NOT NULL DEFAULT ''"], ['schedule', "TEXT NOT NULL DEFAULT ''"], ['preferences', "TEXT NOT NULL DEFAULT ''"],
    ['avoid', "TEXT NOT NULL DEFAULT ''"], ['notes', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'awaiting_questionnaire'"],
    ['admin_note', "TEXT NOT NULL DEFAULT ''"], ['consent', 'INTEGER NOT NULL DEFAULT 0'], ['created_at', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"], ['payment_status', "TEXT NOT NULL DEFAULT 'legacy'"], ['checkout_session_id', 'TEXT'], ['order_id', 'TEXT'],
    ['training_plan_id', 'TEXT'], ['training_plan_name', 'TEXT'], ['training_plan_description', 'TEXT'], ['training_plan_start_date', 'TEXT'],
    ['training_plan_progression', 'TEXT'], ['training_plan_json', 'TEXT'], ['questionnaire_json', "TEXT NOT NULL DEFAULT '{}'"],
  ];
  let existing = new Set<string>();
  try {
    const info = await env.DB.prepare('PRAGMA table_info(individual_plan_requests)').all<{ name: string }>();
    existing = new Set((info.results || []).map((column) => column.name));
  } catch {
    // Fallback below attempts idempotent ALTERs and ignores only duplicate-column errors.
  }
  for (const [column, definition] of additions) {
    if (existing.has(column)) continue;
    try {
      await env.DB.prepare(`ALTER TABLE individual_plan_requests ADD COLUMN ${column} ${definition}`).run();
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).toLowerCase().includes('duplicate column name')) throw error;
    }
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_individual_plan_requests_user ON individual_plan_requests(user_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_individual_plan_requests_status ON individual_plan_requests(payment_status, status, created_at DESC)').run();
}


function ensureNotificationTables(env: V2Env): Promise<void> {
  return ensureSchemaOnce(env, 'notifications', () => createNotificationTables(env));
}

async function createNotificationTables(env: V2Env): Promise<void> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_notifications (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, target_user_id TEXT, created_by TEXT, created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_notification_reads (
    notification_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(notification_id,user_id)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_notifications_target_created ON app_notifications(target_user_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_notifications_created ON app_notifications(created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_notification_reads_user ON app_notification_reads(user_id, notification_id)').run();
}

function ensureChallengeTables(env: V2Env): Promise<void> {
  return ensureSchemaOnce(env, 'challenges', () => createChallengeTables(env));
}

async function createChallengeTables(env: V2Env): Promise<void> {
  // Tworzymy wyłącznie schemat. Wyzwania nie są już automatycznie seedowane:
  // administrator publikuje tylko wybrane, przygotowane oferty.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sf_challenges (
    id TEXT PRIMARY KEY, challenge_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    price_amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'PLN', is_free INTEGER NOT NULL DEFAULT 1,
    product_key TEXT, duration_days INTEGER NOT NULL, training_plan_json TEXT NOT NULL, progress_guide_json TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sf_challenge_participants (
    id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    joined_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(challenge_id,user_id)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sf_challenge_day_logs (
    id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL, user_id TEXT NOT NULL, day_number INTEGER NOT NULL,
    completed_at TEXT NOT NULL, UNIQUE(challenge_id,user_id,day_number)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sf_challenge_participants_user ON sf_challenge_participants(user_id,status)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sf_challenge_day_logs_user ON sf_challenge_day_logs(user_id,challenge_id,day_number)').run();
}
function notificationInsert(env: V2Env, userId: string, title: string, message: string, createdAt = new Date().toISOString()): D1PreparedStatement {
  return env.DB.prepare('INSERT INTO app_notifications(id,title,message,target_user_id,created_by,created_at) VALUES(?,?,?,?,NULL,?)').bind(crypto.randomUUID(), title, message.slice(0, 1200), userId, createdAt);
}

async function ensureSystemTrainingProducts(env: V2Env): Promise<void> {
  const now = new Date().toISOString();
  const products = [
    {
      key: V2_GENERATOR_PRODUCT_KEY,
      title: 'Generator planu treningowego — 1 użycie',
      description: 'Jednorazowe użycie generatora planu treningowego Systemu Formy. Plan na 4 tygodnie z podziałem na dni i progresją.',
      price: V2_GENERATOR_PRICE_CENTS / 100,
    },
    {
      key: V2_INDIVIDUAL_PLAN_PRODUCT_KEY,
      title: 'Indywidualny plan treningowy',
      description: 'Indywidualny plan treningowy przygotowany na podstawie opłaconego formularza i odpowiedzi klienta.',
      price: V2_INDIVIDUAL_PLAN_PRICE_CENTS / 100,
    },
  ];
  for (const item of products) {
    const existing = await env.DB.prepare('SELECT id FROM products WHERE product_key=? LIMIT 1').bind(item.key).first<{ id: string }>();
    if (existing) {
      await env.DB.prepare(`UPDATE products SET title=?,description=?,product_type='training_plan',price_amount=?,currency='PLN',is_free=0,is_published=0,updated_at=? WHERE product_key=?`)
        .bind(item.title, item.description, item.price, now, item.key).run();
    } else {
      await env.DB.prepare(`INSERT INTO products(id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,file_key,original_filename,file_content_type,created_at,updated_at)
        VALUES(?,?,?,?,?,?, 'PLN',0,0,NULL,'','','application/octet-stream',?,?)`)
        .bind(crypto.randomUUID(), item.key, item.title, item.description, 'training_plan', item.price, now, now).run();
    }
  }
}

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
async function v2SitePasswordHash(password:string):Promise<string>{const saltBytes=crypto.getRandomValues(new Uint8Array(16));const salt=Array.from(saltBytes,b=>b.toString(16).padStart(2,'0')).join('');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:100000,hash:'SHA-256'},key,256);const hash=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');return `${salt}:${hash}`;}
async function v2SitePasswordMatches(password:string,stored:string):Promise<boolean>{const [salt,expected]=stored.split(':');if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{64}$/.test(expected||''))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const saltBytes=Uint8Array.from((salt.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:100000,hash:'SHA-256'},key,256);const actual=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');return actual===expected;}

async function v2LimitSiteUnlockAttempts(request: Request, env: V2Env): Promise<void> {
  await ensureSchemaOnce(env, 'site-lock-rate-limit', async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_lock_rate_limit_events (
      scope TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_lock_rate_limit_scope_time ON site_lock_rate_limit_events(scope, created_at)').run();
  });
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const scope = await v2Digest(`site-lock:${ip}`);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM site_lock_rate_limit_events WHERE scope=? AND created_at>=?')
    .bind(scope, now - 15 * 60 * 1000).first<{ total: number }>();
  if (Number(row?.total || 0) >= 8) {
    throw new V2InputError('Wykonano zbyt wiele prób odblokowania. Odczekaj 15 minut i spróbuj ponownie.', 429);
  }
  await env.DB.prepare('INSERT INTO site_lock_rate_limit_events(scope,created_at) VALUES(?,?)').bind(scope, now).run();
  // Cleanup only during a short window each hour, not on every unlock attempt.
  if (now % (60 * 60 * 1000) < 10_000) {
    await env.DB.prepare('DELETE FROM site_lock_rate_limit_events WHERE created_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
  }
}

async function v2VerifySiteUnlockToken(storedHash:string,token:string):Promise<boolean>{const [expiresRaw,signature,extra]=token.split('.');if(!expiresRaw||!signature||extra!==undefined||!/^\d{10,13}$/.test(expiresRaw)||!/^[a-f0-9]{64}$/.test(signature))return false;const expires=Number(expiresRaw);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+24*60*60*1000+60000)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(storedHash),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`system-formy-site-unlock:${expiresRaw}`));const expected=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;}
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
async function v2ReadBoundedText(request: Request, maxBytes = 1024 * 1024): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* stream may already be closed */ }
      throw new V2InputError('Wysłane dane są zbyt duże.', 413);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function v2Body(request: Request): Promise<V2Body> {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) throw new V2InputError('Dane muszą być przesłane jako JSON.');
  let value: unknown;
  try { value = JSON.parse(await v2ReadBoundedText(request)); }
  catch (error) { if (error instanceof V2InputError) throw error; throw new V2InputError('Nieprawidłowe dane formularza.'); }
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
function v2ValidateDate(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }
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
  const premiumEventResponse = await v2PremiumStripeEvents(event, env);
  if (premiumEventResponse) return premiumEventResponse;
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
  if (checkout.mode === 'subscription' && checkout.metadata?.checkout_kind === 'premium_subscription') {
    const userId = typeof checkout.metadata?.user_id === 'string' ? checkout.metadata.user_id : '';
    const planKey = checkout.metadata?.plan_key === 'yearly' ? 'yearly' : checkout.metadata?.plan_key === 'monthly' ? 'monthly' : '';
    const subscriptionId = typeof checkout.subscription === 'string' ? checkout.subscription : '';
    if (!userId || !planKey || !subscriptionId || String(checkout.client_reference_id || '') !== userId) return reject('Brak prawidłowych danych subskrypcji Premium.', sessionId);
    const prior = await env.DB.prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id=? LIMIT 1').bind(eventId).first<{event_id:string}>();
    if (prior) { await diagnose('duplicate','Zdarzenie subskrypcji zostało już obsłużone.',sessionId); return v2Reply({received:true,duplicate:true}); }
    if (checkout.payment_status !== 'paid' && checkout.payment_status !== 'no_payment_required') {
      await diagnose('pending','Stripe nie potwierdził jeszcze pierwszej płatności Premium.',sessionId);
      return v2Reply({received:true,pending:true});
    }
    const user = await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first<{id:string}>();
    if (!user) return reject('Nie znaleziono konta dla subskrypcji Premium.',sessionId);
    await ensurePremiumSubscriptionTable(env);
    if (!env.STRIPE_SECRET_KEY) return v2Reply({ error:'Brak klucza Stripe do potwierdzenia subskrypcji.' }, 503);
    const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`} });
    if (!subscriptionResponse.ok) {
      // Zwróć błąd serwera, aby Stripe ponowił webhook; nie przyznawaj Premium na podstawie niezweryfikowanego fallbacku.
      return v2Reply({ error:'Nie udało się pobrać stanu subskrypcji ze Stripe. Zdarzenie może zostać ponowione.' }, 502);
    }
    let stripeSub = await subscriptionResponse.json() as Record<string, any>;
    stripeSub.metadata = { ...(stripeSub.metadata || {}), user_id:userId, plan_key:planKey, system_formy_premium:'1' };
    if (!stripeSub.status || stripeSub.status === 'incomplete') {
      await diagnose('pending','Stripe nie potwierdził jeszcze aktywnego statusu subskrypcji.',sessionId);
      return v2Reply({ received:true,pending:true });
    }
    const saved = await v2UpsertPremiumSubscription(env, stripeSub, {user_id:userId,plan_key:planKey,stripe_customer_id:typeof checkout.customer==='string'?checkout.customer:null});
    if (!saved) return reject('Nie udało się zapisać subskrypcji Premium.',sessionId);
    const now = new Date().toISOString();
    await ensureNotificationTables(env);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId,eventType,now),
      notificationInsert(env,userId,'System Formy Premium aktywne','Twoja subskrypcja Premium została potwierdzona. Zniżki i funkcje Premium są dostępne na Twoim koncie.',now),
    ]);
    await diagnose('processed','Subskrypcja Premium została zsynchronizowana.',sessionId,'');
    return v2Reply({received:true,premium:true,plan_key:planKey});
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
  if (productKey === V2_GENERATOR_PRODUCT_KEY || productKey === V2_INDIVIDUAL_PLAN_PRODUCT_KEY) await ensureSystemTrainingProducts(env);
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

  if (checkout.metadata?.checkout_kind === 'individual_plan') {
    const premiumPrice = checkout.metadata?.premium_price === '1';
    const allowedAmount = premiumPrice ? V2_INDIVIDUAL_PLAN_PREMIUM_PRICE_CENTS : V2_INDIVIDUAL_PLAN_PRICE_CENTS;
    if (productKey !== V2_INDIVIDUAL_PLAN_PRODUCT_KEY || amount !== allowedAmount || expectedAmount !== allowedAmount || currency !== 'PLN') {
      return reject('Kwota lub produkt planu indywidualnego nie zgadzają się z oczekiwanym zamówieniem.', sessionId);
    }
    await ensureIndividualPlanRequestTable(env);
    const requestId = typeof checkout.metadata?.individual_plan_request_id === 'string' ? checkout.metadata.individual_plan_request_id : '';
    if (!requestId) return reject('Brak identyfikatora formularza planu indywidualnego.', sessionId);
    const savedRequest = await env.DB.prepare('SELECT id,user_id,payment_status,checkout_session_id FROM individual_plan_requests WHERE id=? LIMIT 1')
      .bind(requestId).first<{id:string;user_id:string;payment_status:string;checkout_session_id:string|null}>();
    if (!savedRequest || savedRequest.user_id !== userId || savedRequest.payment_status !== 'pending' || savedRequest.checkout_session_id !== sessionId) {
      return reject('Nie znaleziono oczekującego formularza powiązanego z tą płatnością. Skontaktuj się z obsługą, nie płać ponownie.', sessionId);
    }
    const now = new Date().toISOString(), orderId = crypto.randomUUID(), display = await v2DisplayNumber(env, now);
    await ensureNotificationTables(env);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId, eventType, now),
      env.DB.prepare("INSERT INTO orders(id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES(?,?,?,'paid',?,?,?,?)").bind(orderId, userId, `STRIPE-${sessionId}`, amount / 100, currency, now, now),
      env.DB.prepare('INSERT INTO order_display_numbers(order_id,display_number,created_at) VALUES(?,?,?)').bind(orderId, display, now),
      env.DB.prepare('INSERT INTO order_items(id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES(?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(), orderId, productKey, item.title, item.product_type, amount / 100, now),
      env.DB.prepare("UPDATE individual_plan_requests SET status='awaiting_questionnaire',payment_status='paid',order_id=?,updated_at=? WHERE id=? AND user_id=? AND checkout_session_id=? AND payment_status='pending'").bind(orderId, now, requestId, userId, sessionId),
      notificationInsert(env, userId, 'Zakup potwierdzony', 'Płatność za plan indywidualny została potwierdzona. Twoje zamówienie czeka na realizację.', now),
      env.DB.prepare("UPDATE stripe_webhook_diagnostics SET status='processed',error_message='',checkout_session_id=?,order_id=?,processed_at=? WHERE event_id=?").bind(sessionId, orderId, now, eventId),
    ]);
    return v2Reply({ received: true, paid: true, order_id: orderId, display_order_number: display, individual_plan_request_id: requestId });
  }

  const now = new Date().toISOString(), orderId = crypto.randomUUID();
  const promoId = typeof checkout.metadata?.promo_id === 'string' ? checkout.metadata.promo_id : '';
  const discount = Math.max(0, Number(checkout.metadata?.discount_cents || 0)) / 100;
  const analyticsSession = typeof checkout.metadata?.analytics_session_key === 'string' ? checkout.metadata.analytics_session_key.slice(0, 100) : '';
  const display = await v2DisplayNumber(env, now);
  await ensureNotificationTables(env);
  let linkedChallengeId: string | null = null;
  try {
    const linkedChallenge = await env.DB.prepare('SELECT id FROM sf_challenges WHERE product_key=? AND is_published=1 LIMIT 1').bind(productKey).first<{id:string}>();
    linkedChallengeId = linkedChallenge?.id || null;
  } catch { /* zakup niebędący wyzwaniem nie wymaga tabel wyzwań */ }
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('INSERT INTO stripe_webhook_events(event_id,event_type,received_at) VALUES(?,?,?)').bind(eventId, eventType, now),
    env.DB.prepare("INSERT INTO orders(id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES(?,?,?,'paid',?,?,?,?)").bind(orderId, userId, `STRIPE-${sessionId}`, amount / 100, currency, now, now),
    env.DB.prepare('INSERT INTO order_display_numbers(order_id,display_number,created_at) VALUES(?,?,?)').bind(orderId, display, now),
    env.DB.prepare('INSERT INTO order_items(id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES(?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(), orderId, productKey, item.title, item.product_type, amount / 100, now),
    env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), userId, orderId, productKey, item.title, item.product_type, now, userId, productKey),
    notificationInsert(env, userId, 'Zakup potwierdzony', `Płatność za „${item.title}” została potwierdzona. Produkt jest przypisany do Twojego konta.`, now),
    env.DB.prepare("UPDATE stripe_webhook_diagnostics SET status='processed',error_message='',checkout_session_id=?,order_id=?,processed_at=? WHERE event_id=?").bind(sessionId, orderId, now, eventId),
  ];
  if (linkedChallengeId) {
    const existingParticipant = await env.DB.prepare('SELECT id,status FROM sf_challenge_participants WHERE challenge_id=? AND user_id=? LIMIT 1').bind(linkedChallengeId, userId).first<{id:string;status:string}>();
    if (!existingParticipant || existingParticipant.status === 'paused_premium') {
      statements.push(env.DB.prepare("INSERT INTO sf_challenge_participants(id,challenge_id,user_id,status,joined_at,updated_at) VALUES(?,?,?,'active',?,?) ON CONFLICT(challenge_id,user_id) DO UPDATE SET status='active',updated_at=excluded.updated_at").bind(crypto.randomUUID(), linkedChallengeId, userId, now, now));
      statements.push(notificationInsert(env, userId, 'Wyzwanie rozpoczęte', `Dołączyłeś do wyzwania „${item.title}”. Otwórz zakładkę Wyzwania, aby zobaczyć plan i zaznaczać wykonane dni.`, now));
    }
  }
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
      if (!old) {
        await ensureNotificationTables(env);
        statements.push(env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES(?,?,NULL,?,?,?,'active',?)").bind(crypto.randomUUID(), session.id, item.product_key, item.title, item.product_type, now));
        statements.push(notificationInsert(env, session.id, 'Materiał odblokowany', `Bezpłatny materiał „${item.title}” został przypisany do Twojego konta.`, now));
      }
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
    if (path === '/api/v2/premium/status' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const subscription = await v2PremiumSubscription(env, gate.session!.id);
      const trial = await v2PremiumTrial(env, gate.session!.id);
      const subscriptionActive = Boolean(subscription && ['active','trialing'].includes(subscription.status) && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now()));
      const isTrial = !subscriptionActive && Boolean(trial && Number.isFinite(Date.parse(trial.ends_at)) && Date.parse(trial.ends_at) > Date.now());
      const isPremium = await v2IsPremium(env, gate.session!.id);
      return v2Reply({ is_premium:isPremium, is_trial:isTrial, trial:trial ? {started_at:trial.started_at,ends_at:trial.ends_at} : null,
        subscription:subscription ? { plan_key:subscription.plan_key,status:subscription.status,current_period_end:subscription.current_period_end,cancel_at_period_end:Boolean(subscription.cancel_at_period_end) } : null,
        plans:{ monthly:{price_cents:V2_PREMIUM_MONTHLY_PRICE_CENTS,interval:'month'},yearly:{price_cents:V2_PREMIUM_YEARLY_PRICE_CENTS,interval:'year'} }, benefits:{product_discount_percent:V2_PREMIUM_PRODUCT_DISCOUNT_PERCENT,included_challenge_price_cents:V2_PREMIUM_INCLUDED_CHALLENGE_PRICE_CENTS,paid_challenge_price_cents:V2_PREMIUM_CHALLENGE_PRICE_CENTS,individual_plan_regular_cents:V2_INDIVIDUAL_PLAN_PRICE_CENTS,individual_plan_premium_cents:V2_INDIVIDUAL_PLAN_PREMIUM_PRICE_CENTS} });
    }
    if (path === '/api/v2/premium/checkout' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return v2Reply({error:'Płatności subskrypcyjne nie są w pełni skonfigurowane w Stripe.'},503);
      const body = await v2Body(request), planKey = body.plan_key === 'yearly' ? 'yearly' : body.plan_key === 'monthly' ? 'monthly' : '';
      if (!planKey) return v2Reply({error:'Wybierz plan miesięczny albo roczny.'},400);
      const current = await v2PremiumSubscription(env,gate.session!.id);
      if (current && ['active','trialing','past_due'].includes(current.status) && (!current.current_period_end || Date.parse(current.current_period_end)>Date.now())) return v2Reply({error:'Masz już subskrypcję Premium. Możesz nią zarządzać w ustawieniach Premium.'},409);
      const priceCents = planKey === 'yearly' ? V2_PREMIUM_YEARLY_PRICE_CENTS : V2_PREMIUM_MONTHLY_PRICE_CENTS;
      const origin = url.origin, form = new URLSearchParams();
      form.set('mode','subscription'); form.set('success_url',`${origin}/app/premium?premium=success&session_id={CHECKOUT_SESSION_ID}`); form.set('cancel_url',`${origin}/app/premium?premium=cancelled`);
      form.set('client_reference_id',gate.session!.id); form.set('customer_email',gate.session!.email);
      form.set('line_items[0][price_data][currency]','pln'); form.set('line_items[0][price_data][unit_amount]',String(priceCents)); form.set('line_items[0][price_data][recurring][interval]',planKey==='yearly'?'year':'month');
      form.set('line_items[0][price_data][product_data][name]',planKey==='yearly'?'System Formy Premium — plan roczny':'System Formy Premium — plan miesięczny');
      form.set('line_items[0][price_data][product_data][description]','Premium: brak reklam, rabaty na produkty i dodatkowe funkcje aplikacji.'); form.set('line_items[0][quantity]','1');
      form.set('metadata[v2_checkout]','1'); form.set('metadata[checkout_kind]','premium_subscription'); form.set('metadata[user_id]',gate.session!.id); form.set('metadata[plan_key]',planKey);
      form.set('subscription_data[metadata][system_formy_premium]','1'); form.set('subscription_data[metadata][user_id]',gate.session!.id); form.set('subscription_data[metadata][plan_key]',planKey);
      const response = await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
      const payload = await response.json() as Record<string,any>;
      if (!response.ok || typeof payload.url !== 'string') return v2Reply({error:typeof payload.error?.message==='string'?`Stripe: ${payload.error.message}`:'Nie udało się otworzyć płatności Premium.'},502);
      return v2Reply({url:payload.url,session_id:payload.id});
    }
    if (path === '/api/v2/premium/portal' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (!env.STRIPE_SECRET_KEY) return v2Reply({error:'Portal płatności Stripe nie jest skonfigurowany.'},503);
      const subscription = await v2PremiumSubscription(env,gate.session!.id);
      if (!subscription?.stripe_customer_id) return v2Reply({error:'Nie znaleziono profilu płatniczego Stripe. Skontaktuj się z obsługą.'},404);
      const form = new URLSearchParams(); form.set('customer',subscription.stripe_customer_id); form.set('return_url',`${url.origin}/app/premium`);
      const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
      const payload = await response.json() as Record<string,any>;
      if (!response.ok || typeof payload.url !== 'string') return v2Reply({error:typeof payload.error?.message==='string'?`Stripe: ${payload.error.message}`:'Nie udało się otworzyć zarządzania subskrypcją.'},502);
      return v2Reply({url:payload.url});
    }
    // Publiczny katalog, kategorie i szczegóły produktu.
    if (path === '/api/v2/products' && method === 'GET') {
      await ensureChallengeTables(env);
      const [rows, cats] = await Promise.all([
        env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.created_at,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json,m.cover_key,d.discount_percent AS discount_percent,d.starts_at AS discount_starts_at,d.ends_at AS discount_ends_at,d.is_active AS discount_is_active,EXISTS(SELECT 1 FROM sf_challenges c WHERE c.product_key=p.product_key) AS is_challenge_product FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key LEFT JOIN product_discounts d ON d.product_key=p.product_key WHERE p.is_published=1 ORDER BY p.created_at DESC").all(),
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
      const item = await env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.created_at,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json,m.cover_key,d.discount_percent AS discount_percent,d.starts_at AS discount_starts_at,d.ends_at AS discount_ends_at,d.is_active AS discount_is_active,EXISTS(SELECT 1 FROM sf_challenges c WHERE c.product_key=p.product_key) AS is_challenge_product FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key LEFT JOIN product_discounts d ON d.product_key=p.product_key WHERE p.product_key=? AND p.is_published=1 LIMIT 1").bind(publicDetail[1]).first<Record<string, unknown>>();
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
    // Ephemeral presence: current activity only, no historical analytics timeline.
    if (path === '/api/v2/presence/heartbeat' && method === 'POST') {
      const body = await v2Body(request), sessionKey = v2Field(body, 'session_key', 100), page = v2Field(body, 'path', 400).slice(0, 400);
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(sessionKey)) return v2Reply({ error: 'Nieprawidłowy identyfikator sesji.' }, 400);
      const session = await v2Session(request, env), now = new Date().toISOString();
      await env.DB.prepare('DELETE FROM live_visitors WHERE last_seen < ?').bind(new Date(Date.now() - 3 * 60 * 1000).toISOString()).run();
      await env.DB.prepare('INSERT INTO live_visitors(session_key,user_id,path,first_seen,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(session_key) DO UPDATE SET user_id=excluded.user_id,path=excluded.path,last_seen=excluded.last_seen').bind(sessionKey, session?.id || null, page || '/', now, now).run();
      return v2Reply({ ok: true }, 200);
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

    if (path === '/api/v2/site-lock/status' && method === 'GET') {
      const rows=await env.DB.prepare("SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('site_lock_enabled','site_lock_password_hash')").all<{setting_key:string;setting_value:string}>(); const cfg:Record<string,string>={}; for(const r of rows.results)cfg[r.setting_key]=r.setting_value;
      const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sf_site_unlock='))?.slice('sf_site_unlock='.length)||'';
      const expected=cfg.site_lock_password_hash||''; const unlocked=Boolean(expected&&cookie&&await v2VerifySiteUnlockToken(expected,cookie));
      return v2Reply({enabled:cfg.site_lock_enabled==='true'&&Boolean(expected),unlocked});
    }
    if (path === '/api/v2/site-lock/unlock' && method === 'POST') {
      const b=await v2Body(request),password=v2Field(b,'password',200); const row=await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='site_lock_password_hash'").first<{setting_value:string}>();
      if(!row?.setting_value)return v2Reply({error:'Blokada hasłem nie jest skonfigurowana.'},400);
      await v2LimitSiteUnlockAttempts(request, env);
      if(!(await v2SitePasswordMatches(password,row.setting_value)))return v2Reply({error:'Nieprawidłowe hasło.'},401);
      const expires=Date.now()+24*60*60*1000, expiresRaw=String(expires), key=await crypto.subtle.importKey('raw',new TextEncoder().encode(row.setting_value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const signatureBytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`system-formy-site-unlock:${expiresRaw}`));
      const signature=Array.from(new Uint8Array(signatureBytes),x=>x.toString(16).padStart(2,'0')).join('');
      return v2Reply({ok:true},200,{ 'Set-Cookie':`sf_site_unlock=${expiresRaw}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure` });
    }

    // Złożenie zamówienia z walidacją ceny i kuponu po stronie serwera.
    if (path === '/api/v2/checkout/session' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return v2Reply({ error: 'Płatności Stripe nie są w pełni skonfigurowane.' }, 503);
      const body = await v2Body(request), key = v2Field(body, 'product_key', 100).toLowerCase(), code = v2Field(body, 'promotion_code', 80).toUpperCase(), analyticsSession = v2Field(body, 'analytics_session_key', 100);
      await ensureSystemTrainingProducts(env);
      const generatorCreditProduct = key === V2_GENERATOR_PRODUCT_KEY;
      if (key === V2_INDIVIDUAL_PLAN_PRODUCT_KEY) return v2Reply({ error: 'Plan indywidualny należy zamówić przez formularz, który zapisze odpowiedzi i przekieruje do płatności.' }, 400);
      const item = await v2Product(env, key); if (!item || (!item.is_published && !generatorCreditProduct)) return v2Reply({ error: 'Produkt nie jest dostępny.' }, 404);
      if (item.is_free) return v2Reply({ error: 'Ten produkt jest bezpłatny — użyj opcji odbioru.' }, 400);
      if (!generatorCreditProduct && (!Number.isFinite(item.price_amount) || item.price_amount <= 0)) return v2Reply({ error: 'Produkt nie ma prawidłowej ceny.' }, 400);
      if (generatorCreditProduct && code) return v2Reply({ error: 'Zakup generatora za 29,99 zł nie obsługuje kodów rabatowych.' }, 400);
      const entitlement = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, key).first<{ id: string }>();
      if (entitlement) return v2Reply({ error: 'Masz już dostęp do tego materiału.' }, 409);
      let totalCents = generatorCreditProduct ? V2_GENERATOR_PRICE_CENTS : Math.round(item.price_amount * 100), discountCents = 0, promo: V2PromoCandidate | null = null, includedChallengeByPremium = false;
      const isPremium = await v2IsPremium(env, gate.session!.id);
      let linkedChallengeId: string | null = null;
      let isChallengeProduct = /challenge|wyzwanie/i.test(`${key} ${item.product_type || ''}`);
      try {
        await ensureChallengeTables(env);
        const linkedChallenge = await env.DB.prepare('SELECT id FROM sf_challenges WHERE product_key=? AND is_published=1 LIMIT 1').bind(key).first<{id:string}>();
        linkedChallengeId = linkedChallenge?.id || null;
        isChallengeProduct = isChallengeProduct || Boolean(linkedChallengeId);
      } catch { /* produkty niepowiązane z wyzwaniami nadal mogą być kupowane */ }
      // Rabat bezpośredni produktu: daty i procent sprawdzane po stronie serwera.
      const directDiscount = generatorCreditProduct ? null : await env.DB.prepare('SELECT discount_percent,starts_at,ends_at,is_active FROM product_discounts WHERE product_key=? LIMIT 1').bind(key).first<{discount_percent:number;starts_at:string|null;ends_at:string|null;is_active:number}>().catch(()=>null);
      const discountNow = Date.now();
      if (directDiscount?.is_active && (!directDiscount.starts_at || Date.parse(directDiscount.starts_at) <= discountNow) && (!directDiscount.ends_at || Date.parse(directDiscount.ends_at) >= discountNow)) {
        const directCents = Math.min(totalCents, Math.round(totalCents * Math.max(1, Math.min(99, Number(directDiscount.discount_percent))) / 100));
        discountCents += directCents; totalCents -= directCents;
      }
      // Premium: powiązane wyzwania do 19,99 zł są w abonamencie; droższe mają cenę członkowską 5 zł. Pozostałe materiały mają 20% rabatu.
      if (isPremium && !generatorCreditProduct && key !== V2_INDIVIDUAL_PLAN_PRODUCT_KEY && totalCents > 0) {
        if (Boolean(linkedChallengeId) && isChallengeProduct) {
          if (Math.round(Number(item.price_amount) * 100) <= V2_PREMIUM_INCLUDED_CHALLENGE_PRICE_CENTS) {
            includedChallengeByPremium = true; discountCents += totalCents; totalCents = 0;
          } else {
            const memberChallengePrice = Math.min(totalCents, V2_PREMIUM_CHALLENGE_PRICE_CENTS);
            discountCents += totalCents - memberChallengePrice; totalCents = memberChallengePrice;
          }
        } else {
          const premiumDiscount = Math.min(totalCents, Math.round(totalCents * V2_PREMIUM_PRODUCT_DISCOUNT_PERCENT / 100));
          discountCents += premiumDiscount; totalCents -= premiumDiscount;
        }
      }
      if (code && !generatorCreditProduct && totalCents > 0) {
        promo = await env.DB.prepare('SELECT id,code,discount_type,discount_value,max_uses,used_count,product_key FROM promotion_codes WHERE code=? COLLATE NOCASE AND is_active=1 LIMIT 1').bind(code).first<V2PromoCandidate>();
        if (!promo) return v2Reply({ error: 'Kod rabatowy jest nieprawidłowy lub nieaktywny.' }, 400);
        const dates = await env.DB.prepare('SELECT starts_at,ends_at FROM promotion_codes WHERE id=?').bind(promo.id).first<{ starts_at: string | null; ends_at: string | null }>();
        const now = Date.now();
        if (dates?.starts_at && Date.parse(dates.starts_at) > now) return v2Reply({ error: 'Ten kod nie jest jeszcze aktywny.' }, 400);
        if (dates?.ends_at && Date.parse(dates.ends_at) < now) return v2Reply({ error: 'Ważność tego kodu rabatowego minęła.' }, 400);
        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return v2Reply({ error: 'Limit użyć tego kodu został wyczerpany.' }, 400);
        if (promo.product_key && promo.product_key !== key) return v2Reply({ error: 'Ten kod nie dotyczy wybranego produktu.' }, 400);
        const couponDiscount = promo.discount_type === 'percent' ? Math.round(totalCents * Math.min(100, promo.discount_value) / 100) : Math.round(promo.discount_value * 100);
        const appliedCouponDiscount = Math.min(totalCents, Math.max(0, couponDiscount)); discountCents += appliedCouponDiscount; totalCents -= appliedCouponDiscount;
      }
      if (totalCents === 0) {
        await ensureNotificationTables(env);
        await ensureChallengeTables(env);
        const now = new Date().toISOString(), orderId = crypto.randomUUID(), number = `${includedChallengeByPremium ? 'PREMIUM-CHALLENGE' : 'PROMO'}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
        // Numery SF są osobne od numerów technicznych używanych przez Stripe i zachowują istniejące zamówienia.
        const display = await v2DisplayNumber(env, now);
        const statements: D1PreparedStatement[] = [
          env.DB.prepare("INSERT INTO orders(id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES(?,?,?,'paid',0,?,?,?)").bind(orderId, gate.session!.id, number, item.currency || 'PLN', now, now),
          env.DB.prepare('INSERT INTO order_display_numbers(order_id,display_number,created_at) VALUES(?,?,?)').bind(orderId, display, now),
          env.DB.prepare('INSERT INTO order_items(id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES(?,?,?,?,?,1,0,?)').bind(crypto.randomUUID(), orderId, key, item.title, item.product_type, now),
          env.DB.prepare("INSERT INTO user_entitlements(id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) SELECT ?,?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active')").bind(crypto.randomUUID(), gate.session!.id, orderId, key, item.title, item.product_type, now, gate.session!.id, key),
          notificationInsert(env, gate.session!.id, 'Produkt odblokowany', `Produkt „${item.title}” został odblokowany na Twoim koncie.`, now),
        ];
        if (linkedChallengeId) {
          statements.push(env.DB.prepare("INSERT INTO sf_challenge_participants(id,challenge_id,user_id,status,joined_at,updated_at) VALUES(?,?,?,'active',?,?) ON CONFLICT(challenge_id,user_id) DO UPDATE SET status=CASE WHEN sf_challenge_participants.status='paused_premium' THEN 'active' ELSE sf_challenge_participants.status END,updated_at=excluded.updated_at").bind(crypto.randomUUID(), linkedChallengeId, gate.session!.id, now, now));
          statements.push(notificationInsert(env, gate.session!.id, 'Wyzwanie odblokowane', `Dostęp do wyzwania „${item.title}” został przyznany. Plan i postęp znajdziesz w zakładce Wyzwania.`, now));
        }
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
      form.set('mode', 'payment'); form.set('success_url', generatorCreditProduct ? `${origin}/app/plan/katalog?payment=success&session_id={CHECKOUT_SESSION_ID}` : `${origin}/app/zamowienia?payment=success&session_id={CHECKOUT_SESSION_ID}`); form.set('cancel_url', generatorCreditProduct ? `${origin}/app/plan/katalog?payment=cancelled` : `${origin}/produkty/${encodeURIComponent(key)}?payment=cancelled`);
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
      await ensureIndividualPlanRequestTable(env);
      const rows = await env.DB.prepare('SELECT o.id,o.order_number,COALESCE(d.display_number,o.order_number) AS display_order_number,o.status,o.total_amount,o.currency,o.created_at,o.updated_at FROM orders o LEFT JOIN order_display_numbers d ON d.order_id=o.id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 100').bind(gate.session!.id).all();
      const items = await env.DB.prepare('SELECT i.order_id,i.product_key,i.product_title,i.product_type,i.quantity,i.unit_amount FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=? ORDER BY i.created_at DESC LIMIT 300').bind(gate.session!.id).all();
      // Każdy status jest pobierany wyłącznie z zamówień planu przypisanych do zalogowanego konta.
      const individualPlans = await env.DB.prepare(`SELECT r.id,r.order_id,COALESCE(d.display_number,o.order_number) AS display_order_number,
        r.status,r.payment_status,r.created_at,r.updated_at,r.training_plan_id,r.training_plan_name
        FROM individual_plan_requests r
        LEFT JOIN orders o ON o.id=r.order_id AND o.user_id=r.user_id
        LEFT JOIN order_display_numbers d ON d.order_id=o.id
        WHERE r.user_id=? AND COALESCE(r.payment_status,'legacy') IN ('paid','legacy')
        ORDER BY r.created_at DESC LIMIT 100`).bind(gate.session!.id).all();
      return v2Reply({ orders: rows.results, items: items.results, individual_plans: individualPlans.results });
    }
    if (path === '/api/v2/account/materials' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await v2IsPremium(env, gate.session!.id);
      await ensureChallengeTables(env);
      // Wyklucz produkty przypisane do wyzwań na podstawie relacji w bazie,
      // nie przez stały klucz produktu, który może nie istnieć w danej instalacji.
      const rows = await env.DB.prepare(`SELECT e.id,e.product_key,e.product_title,e.product_type,e.access_status,e.created_at,p.description,p.is_published
        FROM user_entitlements e LEFT JOIN products p ON p.product_key=e.product_key
        WHERE e.user_id=? AND e.access_status='active'
          AND NOT EXISTS (SELECT 1 FROM sf_challenges c WHERE c.product_key=e.product_key)
        ORDER BY e.created_at DESC`).bind(gate.session!.id).all();
      return v2Reply({ materials: rows.results });
    }

    // Indywidualny plan: ankieta jest zapisana jako oczekujący draft, a właściwe zamówienie powstaje dopiero po webhooku Stripe.
    if (path === '/api/v2/training/individual-plan-checkout' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return v2Reply({ error: 'Płatności Stripe nie są w pełni skonfigurowane. Nie wysłano zamówienia; spróbuj ponownie później.' }, 503);
      await ensureIndividualPlanRequestTable(env);
      await ensureSystemTrainingProducts(env);
      const b = await v2Body(request);
      const goal = v2Field(b, 'goal', 40), level = v2Field(b, 'level', 30), location = v2Field(b, 'location', 20);
      const rawEquipment = v2Field(b, 'equipment', 500);
      const days = Number(b.days_per_week), minutes = Number(b.session_minutes), consent = b.consent === true || b.consent === 'true';
      const trainingHistory = v2Field(b, 'training_history', 1500), schedule = v2Field(b, 'schedule', 800), preferences = v2Field(b, 'preferences', 1000), avoid = v2Field(b, 'avoid', 1200), notes = v2Field(b, 'notes', 1500);
      const requestedId = v2Field(b, 'request_id', 80);
      let equipmentList: string[] = [];
      try {
        const parsed: unknown = JSON.parse(rawEquipment || '[]');
        if (Array.isArray(parsed)) equipmentList = parsed.filter((item): item is string => typeof item === 'string');
        else if (typeof parsed === 'string' && parsed) equipmentList = [parsed];
      } catch { if (rawEquipment && rawEquipment !== 'none') equipmentList = [rawEquipment]; }
      // Compatibility with older clients that submitted a scalar "gym" value.
      if (equipmentList.length === 1 && equipmentList[0] === 'gym') equipmentList = ['full_gym'];
      if (!equipmentList.length) equipmentList = location === 'gym' ? ['full_gym'] : ['none'];
      const allowedEquipment = ['full_gym','none','bands','dumbbells','bench','squat_rack','pullup_bar','kettlebell','suspension','barbell','weight_plates','cable_machine','machines','smith_machine','leg_press','leg_extension_curl','chest_press','lat_pulldown','dip_station','cardio','other'];
      if (equipmentList.some(item => !allowedEquipment.includes(item)) || new Set(equipmentList).size !== equipmentList.length || (equipmentList.includes('none') && equipmentList.length > 1) || (equipmentList.includes('full_gym') && equipmentList.length > 1)) return v2Reply({ error: 'Wybierz poprawny zestaw dostępnego sprzętu.' }, 400);
      if (location === 'gym' && equipmentList.includes('none')) return v2Reply({ error: 'Dla treningu na siłowni wybierz dostępny sprzęt albo pełne wyposażenie siłowni.' }, 400);
      const equipment = JSON.stringify(equipmentList);
      const answerLimits: Record<string, number> = {
        age: 3, sex: 40, weight_kg: 20, height_cm: 20, illnesses: 1200, injuries: 1200, congenital_conditions: 1200, medications: 1200,
        max_profile: 10, equipment_other: 300,
        max_bench_press: 80, max_squat: 80, max_situps: 80, max_deadlift: 80, max_pushups: 80, max_knee_pushups: 80, max_squat_bodyweight: 80, max_jumping_jacks: 80,
        max_bench_press_unknown: 10, max_squat_unknown: 10, max_situps_unknown: 10, max_deadlift_unknown: 10, max_pushups_unknown: 10, max_knee_pushups_unknown: 10, max_squat_bodyweight_unknown: 10, max_jumping_jacks_unknown: 10,
        progression: 30, conditioning_rating: 3, strength_rating: 3, unable_exercises: 1200,
      };
      const questionnaire: Record<string, string> = {};
      for (const [key, max] of Object.entries(answerLimits)) questionnaire[key] = v2Field(b, key, max);
      questionnaire.equipment = equipment;
      questionnaire.equipment_other = v2Field(b, 'equipment_other', 300);
      questionnaire.max_profile = questionnaire.max_profile === 'home' ? 'home' : 'gym';
      questionnaire.location = location;
      questionnaire.goal = goal;
      questionnaire.level = level;
      questionnaire.days_per_week = String(days);
      questionnaire.session_minutes = String(minutes);
      questionnaire.training_history = trainingHistory;
      questionnaire.schedule = schedule;
      questionnaire.preferences = preferences;
      questionnaire.avoid = avoid;
      questionnaire.notes = notes;
      const questionnaireJson = JSON.stringify(questionnaire);
      if (!['muscle','strength','fat_loss','general'].includes(goal) || !['beginner','intermediate','advanced'].includes(level) || !['home','gym','both'].includes(location)) return v2Reply({ error: 'W formularzu wybrano nieprawidłowy cel, poziom lub miejsce treningu.' }, 400);
      const age = Number(questionnaire.age), weight = Number(questionnaire.weight_kg), height = Number(questionnaire.height_cm);
      if (!Number.isInteger(age) || age < 13 || age > 100 || !Number.isFinite(weight) || weight < 25 || weight > 400 || !Number.isFinite(height) || height < 100 || height > 250 || !['female','male','other','prefer_not_to_say'].includes(questionnaire.sex)) return v2Reply({ error: 'Sprawdź wiek, płeć, wagę i wzrost.' }, 400);
      if (!Number.isInteger(days) || days < 1 || days > 7 || !Number.isInteger(minutes) || minutes < 30 || minutes > 120) return v2Reply({ error: 'Sprawdź liczbę dni i czas treningu.' }, 400);
      const maxProfile = questionnaire.max_profile === 'home' ? 'home' : 'gym';
      const requiredMaxFields = maxProfile === 'home'
        ? [['max_pushups','max_pushups_unknown'],['max_knee_pushups','max_knee_pushups_unknown'],['max_squat_bodyweight','max_squat_bodyweight_unknown'],['max_situps','max_situps_unknown'],['max_jumping_jacks','max_jumping_jacks_unknown']]
        : [['max_bench_press','max_bench_press_unknown'],['max_squat','max_squat_unknown'],['max_situps','max_situps_unknown'],['max_deadlift','max_deadlift_unknown']];
      for (const [valueKey, unknownKey] of requiredMaxFields) {
        const rawValue = (questionnaire[valueKey] || '').trim();
        const explicitlyUnknown = questionnaire[unknownKey] === 'true';
        if (!rawValue && !explicitlyUnknown) return v2Reply({ error: 'Dla każdego maksimum wpisz wynik albo zaznacz „Nie wiem”.' }, 400);
        if (rawValue && (!Number.isFinite(Number(rawValue)) || Number(rawValue) < 0 || Number(rawValue) > 1000)) return v2Reply({ error: 'Sprawdź wartości maksimów — muszą być liczbami od 0 do 1000.' }, 400);
      }
      if (equipmentList.includes('other') && !questionnaire.equipment_other.trim()) return v2Reply({ error: 'Opisz inny dostępny sprzęt.' }, 400);
      if (!consent) return v2Reply({ error: 'Zaznacz zgodę na wykorzystanie odpowiedzi do obsługi zamówienia.' }, 400);
      const profile = await env.DB.prepare('SELECT first_name FROM user_profiles WHERE user_id=? LIMIT 1').bind(gate.session!.id).first<{ first_name: string | null }>().catch(() => null);
      const fullName = (profile?.first_name || '').trim().slice(0, 80), now = new Date().toISOString();
      let requestId: string = crypto.randomUUID();
      if (requestedId) {
        const draft = await env.DB.prepare('SELECT id,user_id,payment_status FROM individual_plan_requests WHERE id=? LIMIT 1').bind(requestedId).first<{id:string;user_id:string;payment_status:string}>();
        if (!draft || draft.user_id !== gate.session!.id || draft.payment_status !== 'pending') return v2Reply({ error: 'Nie można wznowić tego formularza. Odśwież stronę i rozpocznij nowe zamówienie.' }, 409);
        requestId = draft.id;
        await env.DB.prepare(`UPDATE individual_plan_requests SET email=?,full_name=?,goal=?,level=?,location=?,equipment=?,days_per_week=?,session_minutes=?,training_history=?,schedule=?,preferences=?,avoid=?,notes=?,questionnaire_json=?,status='awaiting_questionnaire',admin_note='',consent=1,updated_at=?,payment_status='pending',checkout_session_id=NULL,order_id=NULL WHERE id=? AND user_id=?`)
          .bind(gate.session!.email, fullName, goal, level, location, equipment, days, minutes, trainingHistory, schedule, preferences, avoid, notes, questionnaireJson, now, requestId, gate.session!.id).run();
      } else {
        await env.DB.prepare(`INSERT INTO individual_plan_requests(id,user_id,email,full_name,goal,level,location,equipment,days_per_week,session_minutes,training_history,schedule,preferences,avoid,notes,questionnaire_json,status,admin_note,consent,created_at,updated_at,payment_status,checkout_session_id,order_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'awaiting_questionnaire','',1,?,?,'pending',NULL,NULL)`)
          .bind(requestId, gate.session!.id, gate.session!.email, fullName, goal, level, location, equipment, days, minutes, trainingHistory, schedule, preferences, avoid, notes, questionnaireJson, now, now).run();
      }
      const item = await v2Product(env, V2_INDIVIDUAL_PLAN_PRODUCT_KEY);
      if (!item) return v2Reply({ error: 'Nie udało się przygotować produktu planu indywidualnego. Spróbuj ponownie.' }, 500);
      const premiumPlanPrice = await v2IsPremium(env, gate.session!.id);
      const individualPlanPriceCents = premiumPlanPrice ? V2_INDIVIDUAL_PLAN_PREMIUM_PRICE_CENTS : V2_INDIVIDUAL_PLAN_PRICE_CENTS;
      const origin = url.origin, form = new URLSearchParams();
      form.set('mode', 'payment');
      form.set('success_url', `${origin}/app/zamowienia?payment=success&session_id={CHECKOUT_SESSION_ID}&kind=individual_plan`);
      form.set('cancel_url', `${origin}/app/plan/indywidualny?payment=cancelled&request_id=${encodeURIComponent(requestId)}`);
      form.set('client_reference_id', gate.session!.id);
      form.set('customer_email', gate.session!.email);
      form.set('line_items[0][price_data][currency]', 'pln');
      form.set('line_items[0][price_data][unit_amount]', String(individualPlanPriceCents));
      form.set('line_items[0][price_data][product_data][name]', 'Indywidualny plan treningowy');
      form.set('line_items[0][price_data][product_data][description]', 'Indywidualny plan przygotowany na podstawie Twoich odpowiedzi w ankiecie.');
      form.set('line_items[0][quantity]', '1');
      form.set('metadata[v2_checkout]', '1');
      form.set('metadata[checkout_kind]', 'individual_plan');
      form.set('metadata[user_id]', gate.session!.id);
      form.set('metadata[product_key]', V2_INDIVIDUAL_PLAN_PRODUCT_KEY);
      form.set('metadata[product_id]', item.id);
      form.set('metadata[unit_amount_cents]', String(individualPlanPriceCents));
      form.set('metadata[premium_price]', premiumPlanPrice ? '1' : '0');
      form.set('metadata[individual_plan_request_id]', requestId);
      form.set('payment_intent_data[metadata][user_id]', gate.session!.id);
      form.set('payment_intent_data[metadata][product_key]', V2_INDIVIDUAL_PLAN_PRODUCT_KEY);
      form.set('payment_intent_data[metadata][individual_plan_request_id]', requestId);
      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      const payload = await stripeResponse.json() as Record<string, any>;
      if (!stripeResponse.ok || typeof payload.url !== 'string' || typeof payload.id !== 'string') return v2Reply({ error: typeof payload.error?.message === 'string' ? `Stripe: ${payload.error.message}` : 'Nie udało się otworzyć płatności za plan indywidualny.' }, 502);
      await env.DB.prepare("UPDATE individual_plan_requests SET checkout_session_id=?,updated_at=? WHERE id=? AND user_id=? AND payment_status='pending'").bind(payload.id, new Date().toISOString(), requestId, gate.session!.id).run();
      return v2Reply({ ok: true, url: payload.url, session_id: payload.id, request_id: requestId, amount_cents: individualPlanPriceCents, is_premium_price: premiumPlanPrice });
    }

    // Stary endpoint nie pozwala już ominąć płatności bezpośrednim POST-em.
    if (path === '/api/v2/training/individual-plan-requests' && method === 'POST') {
      return v2Reply({ error: 'Zamówienie planu indywidualnego wymaga opłacenia ceny widocznej w formularzu. Użyj przycisku w formularzu, który przekieruje Cię do płatności.' }, 402);
    }

    // Generator treningów AI: zachowany stary endpoint historyczny, ale nowy kreator nie wywołuje modelu.
    // Plany użytkownika: dowolna liczba planów, dni i ćwiczeń.
    if (path === '/api/v2/training/plans' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await ensureIndividualPlanRequestTable(env);
      const isPremium = await v2IsPremium(env, gate.session!.id), planLimit = isPremium ? 3 : 1;
      const plans = await env.DB.prepare("SELECT p.id,p.name,p.description,p.duration_weeks,p.start_date,p.progression_strategy,p.created_at,p.updated_at,EXISTS (SELECT 1 FROM individual_plan_requests ir WHERE ir.training_plan_id=p.id AND ir.user_id=p.user_id) AS is_individual_plan FROM training_plans_v2 p WHERE p.user_id=? AND NOT EXISTS (SELECT 1 FROM individual_plan_requests r WHERE r.training_plan_id=p.id AND r.user_id=p.user_id AND r.status!='ready') ORDER BY p.updated_at DESC").bind(gate.session!.id).all<{ id: string; name: string; description: string; duration_weeks: number; start_date: string | null; progression_strategy: string; created_at: string; updated_at: string; is_individual_plan: number }>();
      const customPlanCountRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM training_plans_v2 p WHERE p.user_id=? AND p.name NOT IN ('Plan przykładowy — dom bez sprzętu','Plan przykładowy — siłownia') AND NOT EXISTS (SELECT 1 FROM individual_plan_requests r WHERE r.training_plan_id=p.id AND r.user_id=p.user_id)").bind(gate.session!.id).first<{ count: number }>();
      const customPlansUsed = Number(customPlanCountRow?.count || 0);
      const output = [] as Array<Record<string, unknown>>;
      for (const plan of plans.results) {
        const days = await env.DB.prepare('SELECT id,day_key,title,sort_order FROM training_plan_days_v2 WHERE plan_id=? ORDER BY sort_order,day_key').bind(plan.id).all<{ id: string; day_key: string; title: string; sort_order: number }>();
        const dayOutput = [] as Array<Record<string, unknown>>;
        for (const day of days.results) {
          const exercises = await env.DB.prepare('SELECT id,name,sort_order,target_sets,target_reps,target_weight_kg,notes,rest_seconds,transition_rest_seconds,alternatives_json FROM training_plan_exercises_v2 WHERE day_id=? ORDER BY sort_order').bind(day.id).all<{ id: string; name: string; sort_order: number; target_sets: number; target_reps: number; target_weight_kg: number | null; notes: string; rest_seconds: number; transition_rest_seconds: number; alternatives_json: string }>();
          dayOutput.push({ ...day, exercises: exercises.results.map(ex => { let alternatives: string[] = []; try { const value = JSON.parse(ex.alternatives_json || '[]'); if (Array.isArray(value)) alternatives = value.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3); } catch { alternatives = []; } return { id: ex.id, name: ex.name, sort_order: ex.sort_order, sets: ex.target_sets, reps: ex.target_reps, weight_kg: ex.target_weight_kg, notes: ex.notes, rest_seconds: ex.rest_seconds ?? 90, transition_rest_seconds: ex.transition_rest_seconds ?? 120, alternatives }; }) });
        }
        output.push({ ...plan, days: dayOutput });
      }
      const legacy = await env.DB.prepare('SELECT day_key,title,exercises_json,updated_at FROM training_plan_days WHERE user_id=? ORDER BY day_key').bind(gate.session!.id).all();
      return v2Reply({ plans: output, legacy: legacy.results, is_premium: isPremium, plan_limit: planLimit, plans_used: customPlansUsed });
    }
    if (path === '/api/v2/training/plans' && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const b = await v2Body(request), name = v2Field(b, 'name', 120), description = v2Field(b, 'description', 1000);
      const paidGeneratorPlan = b.source === 'paid_generator';
      if (paidGeneratorPlan) {
        const credit = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, V2_GENERATOR_PRODUCT_KEY).first<{ id: string }>();
        if (!credit) return v2Reply({ error: 'Aby zapisać plan z generatora, kup najpierw jednorazowe użycie za 29,99 zł.' }, 403);
      }
      const durationWeeks = 4;
      const requestedStartDate = typeof b.start_date === 'string' ? b.start_date.trim() : '';
      const startDate = requestedStartDate || new Date().toISOString().slice(0, 10);
      const allowedProgressions = ['reps', 'weight', 'sets', 'none'];
      const progressionStrategy = typeof b.progression_strategy === 'string' && allowedProgressions.includes(b.progression_strategy) ? b.progression_strategy : 'reps';
      if (!v2ValidateDate(startDate)) return v2Reply({ error: 'Wybierz prawidłową datę rozpoczęcia programu.' }, 400);
      if (name.length < 2) return v2Reply({ error: 'Nazwa planu musi mieć co najmniej 2 znaki.' }, 400);
      // Gotowe plany przykładowe są dostępne bez uzupełniania profilu.
      // Każdy inny plan wymaga podstawowych danych profilu po stronie serwera.
      const sampleNames = ['Plan przykładowy — dom bez sprzętu', 'Plan przykładowy — siłownia'];
      const isSamplePlan = b.source === 'sample' && sampleNames.includes(name);
      if (sampleNames.includes(name) && !isSamplePlan) return v2Reply({ error: 'Ta nazwa jest zarezerwowana dla planu przykładowego. Wybierz inną nazwę dla własnego planu.' }, 400);
      if (isSamplePlan) {
        const duplicateSample = await env.DB.prepare('SELECT id FROM training_plans_v2 WHERE user_id=? AND name=? LIMIT 1').bind(gate.session!.id, name).first<{ id: string }>();
        if (duplicateSample) return v2Reply({ error: 'Ten plan przykładowy jest już zapisany na koncie.' }, 409);
      }
      if (!isSamplePlan) {
        const profile = await env.DB.prepare('SELECT first_name,primary_goal,training_location,training_days_per_week FROM user_profiles WHERE user_id=? LIMIT 1').bind(gate.session!.id).first<{ first_name: string | null; primary_goal: string | null; training_location: string | null; training_days_per_week: number | null }>();
        if (!profile?.first_name?.trim() || !profile.primary_goal || !profile.training_location || !profile.training_days_per_week) {
          return v2Reply({ error: 'Przed utworzeniem własnego planu uzupełnij profil: imię, główny cel, miejsce treningu i liczbę treningów w tygodniu.' }, 403);
        }
      }
      const isPremium = await v2IsPremium(env, gate.session!.id), planLimit = isPremium ? 3 : 1;
      const planCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM training_plans_v2 p WHERE p.user_id=? AND p.name NOT IN ('Plan przykładowy — dom bez sprzętu','Plan przykładowy — siłownia') AND NOT EXISTS (SELECT 1 FROM individual_plan_requests r WHERE r.training_plan_id=p.id AND r.user_id=p.user_id)").bind(gate.session!.id).first<{ count: number }>();
      const plansUsed = Number(planCount?.count || 0);
      if (!isSamplePlan && plansUsed >= planLimit) {
        return v2Reply({ error: isPremium ? 'Konto Premium może mieć maksymalnie 3 zapisane plany treningowe. Usuń jeden z obecnych planów, aby dodać kolejny.' : 'Na zwykłym koncie możesz mieć 1 zapisany plan treningowy. Usuń obecny plan albo uzyskaj dostęp Premium, aby móc zapisać do 3 planów.', is_premium: isPremium, plan_limit: planLimit, plans_used: plansUsed }, 409);
      }
      const now = new Date().toISOString(), id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO training_plans_v2(id,user_id,name,description,duration_weeks,start_date,progression_strategy,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, gate.session!.id, name, description, durationWeeks, startDate, progressionStrategy, now, now).run();
      return v2Reply({ ok: true, plan: { id, name, description, duration_weeks: durationWeeks, start_date: startDate, progression_strategy: progressionStrategy, created_at: now, updated_at: now, days: [] } }, 201);
    }
    const planMatch = path.match(/^\/api\/v2\/training\/plans\/([a-f0-9-]+)$/i);
    if (planMatch && ['PUT', 'DELETE'].includes(method)) {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      const plan = await env.DB.prepare('SELECT id,name,description,duration_weeks,start_date,progression_strategy FROM training_plans_v2 WHERE id=? AND user_id=?').bind(planMatch[1], gate.session!.id).first<{ id: string; name: string; description: string; duration_weeks: number; start_date: string | null; progression_strategy: string }>();
      if (!plan) return v2Reply({ error: 'Nie znaleziono planu.' }, 404);
      if (method === 'DELETE') {
        await ensureIndividualPlanRequestTable(env);
        const now = new Date().toISOString();
        const assignments = await env.DB.prepare('SELECT id,order_id FROM individual_plan_requests WHERE training_plan_id=? AND user_id=?').bind(plan.id, gate.session!.id).all<{id:string;order_id:string|null}>();
        const statements: D1PreparedStatement[] = [];
        // If the user removes a delivered personal plan, keep the paid order but return it to "in preparation"
        // so the administrator can recreate and reassign the plan without losing the order history.
        if (assignments.results.length) {
          statements.push(env.DB.prepare(`UPDATE orders SET status='processing',updated_at=? WHERE id IN (SELECT order_id FROM individual_plan_requests WHERE training_plan_id=? AND user_id=? AND order_id IS NOT NULL)`).bind(now, plan.id, gate.session!.id));
          statements.push(env.DB.prepare(`UPDATE individual_plan_requests SET training_plan_id=NULL,training_plan_name=NULL,training_plan_description=NULL,training_plan_start_date=NULL,training_plan_progression=NULL,training_plan_json=NULL,status='in_preparation',updated_at=? WHERE training_plan_id=? AND user_id=?`).bind(now, plan.id, gate.session!.id));
        }
        statements.push(env.DB.prepare('DELETE FROM training_plan_exercises_v2 WHERE day_id IN (SELECT id FROM training_plan_days_v2 WHERE plan_id=?)').bind(plan.id));
        statements.push(env.DB.prepare('DELETE FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id));
        statements.push(env.DB.prepare('DELETE FROM training_plans_v2 WHERE id=? AND user_id=?').bind(plan.id, gate.session!.id));
        const results = await env.DB.batch(statements);
        const deleted = results[results.length - 1]?.meta?.changes || 0;
        if (!deleted) return v2Reply({ error: 'Nie udało się usunąć planu. Odśwież bibliotekę planów i spróbuj ponownie.' }, 409);
        return v2Reply({ ok: true, deleted: true, order_returned_to_preparation: assignments.results.length > 0 });
      }
      const b = await v2Body(request), name = v2Field(b, 'name', 120), description = v2Field(b, 'description', 1000), rawDays = Array.isArray(b.days) ? b.days : [];
      const consumeGeneratorCredit = b.consume_generator_credit === true;
      const allowEmptyDays = b.allow_empty_days === true;
      const generatorCredit = consumeGeneratorCredit ? await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, V2_GENERATOR_PRODUCT_KEY).first<{ id: string }>() : null;
      if (consumeGeneratorCredit && !generatorCredit) return v2Reply({ error: 'Użycie generatora zostało już wykorzystane lub nie jest aktywne. Opłać kolejne użycie, aby zapisać nowy plan.' }, 403);
      const durationWeeks = 4;
      const requestedStartDate = typeof b.start_date === 'string' ? b.start_date.trim() : '';
      const startDate = requestedStartDate || plan.start_date || new Date().toISOString().slice(0, 10);
      const allowedProgressions = ['reps', 'weight', 'sets', 'none'];
      const progressionStrategy = typeof b.progression_strategy === 'string' && allowedProgressions.includes(b.progression_strategy) ? b.progression_strategy : (allowedProgressions.includes(plan.progression_strategy) ? plan.progression_strategy : 'reps');
      if (!v2ValidateDate(startDate)) return v2Reply({ error: 'Wybierz prawidłową datę rozpoczęcia programu.' }, 400);
      if (name.length < 2 || rawDays.length < 1 || rawDays.length > 7) return v2Reply({ error: 'Sprawdź nazwę planu i liczbę dni (od 1 do 7).' }, 400);
      const sampleNames = ['Plan przykładowy — dom bez sprzętu', 'Plan przykładowy — siłownia'];
      const wasSample = sampleNames.includes(plan.name), willBeSample = sampleNames.includes(name);
      if (!wasSample && willBeSample) return v2Reply({ error: 'Ta nazwa jest zarezerwowana dla planu przykładowego. Wybierz inną nazwę.' }, 400);
      if (wasSample && !willBeSample) {
        const isPremium = await v2IsPremium(env, gate.session!.id);
        const planLimit = isPremium ? 3 : 1;
        const currentCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM training_plans_v2 p WHERE p.user_id=? AND p.name NOT IN ('Plan przykładowy — dom bez sprzętu','Plan przykładowy — siłownia') AND NOT EXISTS (SELECT 1 FROM individual_plan_requests r WHERE r.training_plan_id=p.id AND r.user_id=p.user_id)").bind(gate.session!.id).first<{ count: number }>();
        if (Number(currentCount?.count || 0) >= planLimit) return v2Reply({ error: 'Nie możesz zmienić przykładowego planu w kolejny własny plan, ponieważ limit zapisanych planów został wykorzystany.' }, 409);
      }
      const normalized: Array<{ day_key: string; title: string; exercises: Array<{ name: string; sets: number; reps: number; weight_kg: number | null; notes: string; rest_seconds: number; transition_rest_seconds: number; alternatives: string[] }> }> = [];
      for (const raw of rawDays) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return v2Reply({ error: 'Nieprawidłowy dzień planu.' }, 400);
        const d = raw as Record<string, unknown>, dayKey = typeof d.day_key === 'string' ? d.day_key.trim().slice(0, 30) : '', title = typeof d.title === 'string' ? d.title.trim().slice(0, 120) : '', rawExercises = Array.isArray(d.exercises) ? d.exercises : [];
        if (!title || !dayKey || rawExercises.length > 40) return v2Reply({ error: 'Każdy dzień musi mieć nazwę i maksymalnie 40 ćwiczeń.' }, 400);
        if (!allowEmptyDays && rawExercises.length === 0) return v2Reply({ error: `Dzień „${title}” nie ma ćwiczeń. Dodaj przynajmniej jedno ćwiczenie przed zapisem.` }, 400);
        const exercises: Array<{ name: string; sets: number; reps: number; weight_kg: number | null; notes: string; rest_seconds: number; transition_rest_seconds: number; alternatives: string[] }> = [];
        for (const value of rawExercises) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return v2Reply({ error: 'Nieprawidłowe ćwiczenie.' }, 400);
          const x = value as Record<string, unknown>, exerciseName = typeof x.name === 'string' ? x.name.trim() : '', sets = Number(x.sets ?? 3), reps = Number(x.reps ?? 10), weight = x.weight_kg === '' || x.weight_kg == null ? null : Number(x.weight_kg), notes = typeof x.notes === 'string' ? x.notes.slice(0, 500) : '', restSeconds = Number(x.rest_seconds ?? 90), transitionRestSeconds = Number(x.transition_rest_seconds ?? 120), alternatives = Array.isArray(x.alternatives) ? Array.from(new Set(x.alternatives.filter((name): name is string => typeof name === 'string').map(name => name.trim()).filter(name => name.length > 0 && name.length <= 120 && name.toLowerCase() !== exerciseName.toLowerCase()))).slice(0, 3) : [];
          if (!exerciseName || exerciseName.length > 120 || !Number.isInteger(sets) || sets < 1 || sets > 30 || !Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) || !Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 600 || !Number.isInteger(transitionRestSeconds) || transitionRestSeconds < 0 || transitionRestSeconds > 900) return v2Reply({ error: 'Sprawdź nazwę ćwiczenia, serie, powtórzenia i ciężar.' }, 400);
          exercises.push({ name: exerciseName, sets, reps, weight_kg: weight, notes, rest_seconds: restSeconds, transition_rest_seconds: transitionRestSeconds, alternatives });
        }
        normalized.push({ day_key: dayKey, title, exercises });
      }
      const now = new Date().toISOString();
      const oldDays = await env.DB.prepare('SELECT id FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id).all<{ id: string }>();
      const statements: D1PreparedStatement[] = [env.DB.prepare('UPDATE training_plans_v2 SET name=?,description=?,duration_weeks=?,start_date=?,progression_strategy=?,updated_at=? WHERE id=? AND user_id=?').bind(name, description, durationWeeks, startDate, progressionStrategy, now, plan.id, gate.session!.id)];
      if (oldDays.results.length) { for (const day of oldDays.results) statements.push(env.DB.prepare('DELETE FROM training_plan_exercises_v2 WHERE day_id=?').bind(day.id)); statements.push(env.DB.prepare('DELETE FROM training_plan_days_v2 WHERE plan_id=?').bind(plan.id)); }
      normalized.forEach((day, di) => {
        const dayId = crypto.randomUUID(); statements.push(env.DB.prepare('INSERT INTO training_plan_days_v2(id,plan_id,day_key,title,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(dayId, plan.id, day.day_key, day.title, di, now, now));
        day.exercises.forEach((ex, ei) => statements.push(env.DB.prepare('INSERT INTO training_plan_exercises_v2(id,day_id,name,sort_order,target_sets,target_reps,target_weight_kg,notes,rest_seconds,transition_rest_seconds,alternatives_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), dayId, ex.name, ei, ex.sets, ex.reps, ex.weight_kg, ex.notes, ex.rest_seconds, ex.transition_rest_seconds, JSON.stringify(ex.alternatives))));
      });
      if (consumeGeneratorCredit && generatorCredit) statements.push(env.DB.prepare("UPDATE user_entitlements SET access_status='used' WHERE id=? AND access_status='active'").bind(generatorCredit.id));
      if (statements.length) await env.DB.batch(statements);
      return v2Reply({ ok: true, duration_weeks: durationWeeks, start_date: startDate, progression_strategy: progressionStrategy, updated_at: now });
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
        const restSeconds = Number(x.rest_seconds ?? 90), transitionRestSeconds = Number(x.transition_rest_seconds ?? 120);
        if (!name || name.length > 120) return v2Reply({ error: 'Każde ćwiczenie musi mieć nazwę.' }, 400);
        if (!Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 600 || !Number.isInteger(transitionRestSeconds) || transitionRestSeconds < 0 || transitionRestSeconds > 900) return v2Reply({ error: 'Nieprawidłowy czas przerwy.' }, 400);
        if (sets) {
          if (sets.length < 1 || sets.length > 40) return v2Reply({ error: 'Ćwiczenie musi mieć od 1 do 40 serii.' }, 400);
          for (const sv of sets) { if (!sv || typeof sv !== 'object' || Array.isArray(sv)) return v2Reply({ error: 'Nieprawidłowa seria.' }, 400); const set = sv as Record<string, unknown>, reps = Number(set.reps), weight = set.weight_kg === '' || set.weight_kg == null ? null : Number(set.weight_kg); if (!Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź powtórzenia i ciężar w serii.' }, 400); }
          const validSets = sets.map((sv) => { const set = sv as Record<string, unknown>; return { reps: Number(set.reps), weight_kg: set.weight_kg === '' || set.weight_kg == null ? null : Number(set.weight_kg) }; });
          exercises.push({ name, sets: validSets.length, reps: validSets[0]?.reps || 1, weight_kg: validSets[0]?.weight_kg ?? null, rest_seconds: restSeconds, transition_rest_seconds: transitionRestSeconds, sets_detail: validSets });
        } else {
          const setCount = Number(x.sets), reps = Number(x.reps), weight = x.weight_kg == null ? null : Number(x.weight_kg);
          if (!Number.isInteger(setCount) || setCount < 1 || setCount > 40 || !Number.isInteger(reps) || reps < 1 || reps > 200 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź serie, powtórzenia i ciężar.' }, 400);
          exercises.push({ name, sets: setCount, reps, weight_kg: weight, rest_seconds: restSeconds, transition_rest_seconds: transitionRestSeconds });
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

    if (path === '/api/v2/challenges' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await v2IsPremium(env, gate.session!.id);
      await ensureChallengeTables(env);
      const rows = await env.DB.prepare(`SELECT c.*,COALESCE(p.status,'') AS user_status,p.joined_at,
        (SELECT COUNT(*) FROM sf_challenge_participants cp WHERE cp.challenge_id=c.id AND cp.status IN ('active','completed')) AS participants_count,
        (SELECT COUNT(*) FROM sf_challenge_day_logs l WHERE l.challenge_id=c.id AND l.user_id=?) AS completed_days,
        COALESCE((SELECT group_concat(l.day_number, ',') FROM sf_challenge_day_logs l WHERE l.challenge_id=c.id AND l.user_id=?),'') AS completed_day_numbers
        FROM sf_challenges c LEFT JOIN sf_challenge_participants p ON p.challenge_id=c.id AND p.user_id=?
        WHERE c.is_published=1 ORDER BY c.is_free DESC,c.duration_days ASC`).bind(gate.session!.id, gate.session!.id, gate.session!.id).all();
      return v2Reply({ challenges: rows.results || [] });
    }
    const challengeActionMatch = path.match(/^\/api\/v2\/challenges\/([a-z0-9-]+)\/(join|progress)$/i);
    if (challengeActionMatch && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await ensureChallengeTables(env); await ensureNotificationTables(env);
      const challengeId = challengeActionMatch[1], action = challengeActionMatch[2].toLowerCase();
      const challenge = await env.DB.prepare('SELECT id,title,is_free,product_key,duration_days FROM sf_challenges WHERE id=? AND is_published=1 LIMIT 1').bind(challengeId).first<{id:string;title:string;is_free:number;product_key:string|null;duration_days:number}>();
      if (!challenge) return v2Reply({error:'Nie znaleziono aktywnego wyzwania.'},404);
      await v2IsPremium(env, gate.session!.id);
      const now = new Date().toISOString();
      if (action === 'join') {
        if (!challenge.is_free && challenge.product_key) {
          const access = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, challenge.product_key).first<{id:string}>();
          if (!access) return v2Reply({error:'To wyzwanie jest płatne. Najpierw opłać produkt.'},402);
        }
        const existingParticipant = await env.DB.prepare('SELECT id,status FROM sf_challenge_participants WHERE challenge_id=? AND user_id=? LIMIT 1').bind(challenge.id, gate.session!.id).first<{id:string;status:string}>();
        if (existingParticipant) return v2Reply({ok:true,already_joined:true,status:existingParticipant.status});
        await env.DB.batch([
          env.DB.prepare("INSERT INTO sf_challenge_participants(id,challenge_id,user_id,status,joined_at,updated_at) VALUES(?,?,?,'active',?,?)").bind(crypto.randomUUID(), challenge.id, gate.session!.id, now, now),
          notificationInsert(env, gate.session!.id, 'Wyzwanie rozpoczęte', `Rozpocząłeś wyzwanie „${challenge.title}”. Plan i wykonane dni znajdziesz w zakładce Wyzwania.`, now),
        ]);
        return v2Reply({ok:true,status:'active'},201);
      }
      if (!challenge.is_free && challenge.product_key) {
        const access = await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(gate.session!.id, challenge.product_key).first<{id:string}>();
        if (!access) return v2Reply({error:'Dostęp do tego płatnego wyzwania nie jest aktywny. Sprawdź zakup w sklepie.'},402);
      }
      const body = await v2Body(request), dayNumber = Number(body.day_number);
      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > challenge.duration_days) return v2Reply({error:'Wskaż prawidłowy dzień wyzwania.'},400);
      const participant = await env.DB.prepare('SELECT id,status FROM sf_challenge_participants WHERE challenge_id=? AND user_id=? LIMIT 1').bind(challenge.id, gate.session!.id).first<{id:string;status:string}>();
      if (!participant) return v2Reply({error:'Najpierw dołącz do wyzwania.'},403);
      if (participant.status === 'completed') return v2Reply({ok:true,already_completed:true,status:'completed'});
      const result = await env.DB.prepare('INSERT OR IGNORE INTO sf_challenge_day_logs(id,challenge_id,user_id,day_number,completed_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), challenge.id, gate.session!.id, dayNumber, now).run();
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM sf_challenge_day_logs WHERE challenge_id=? AND user_id=?').bind(challenge.id, gate.session!.id).first<{count:number}>();
      const complete = Number(count?.count || 0) >= challenge.duration_days;
      if (complete && participant.status !== 'completed') {
        await env.DB.batch([
          env.DB.prepare("UPDATE sf_challenge_participants SET status='completed',updated_at=? WHERE challenge_id=? AND user_id=?").bind(now, challenge.id, gate.session!.id),
          notificationInsert(env, gate.session!.id, 'Wyzwanie ukończone', `Ukończyłeś wyzwanie „${challenge.title}”. Sprawdź swój zapisany postęp i zaplanuj kolejny krok.`, now),
        ]);
      } else if (result.meta.changes) {
        await env.DB.prepare('UPDATE sf_challenge_participants SET updated_at=? WHERE challenge_id=? AND user_id=?').bind(now, challenge.id, gate.session!.id).run();
      }
      return v2Reply({ok:true,completed_days:Number(count?.count||0),duration_days:challenge.duration_days,status:complete?'completed':'active'});
    }

    if (path === '/api/v2/notifications' && method === 'GET') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await ensureNotificationTables(env);
      const rows = await env.DB.prepare(`SELECT n.id,n.title,n.message,n.created_at FROM app_notifications n LEFT JOIN app_notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE r.notification_id IS NULL AND (n.target_user_id IS NULL OR n.target_user_id=?) ORDER BY n.created_at DESC LIMIT 50`).bind(gate.session!.id, gate.session!.id).all();
      return v2Reply({ notifications: rows.results || [] });
    }
    const notificationReadMatch = path.match(/^\/api\/v2\/notifications\/([a-f0-9-]+)\/read$/i);
    if (notificationReadMatch && method === 'POST') {
      const gate = await v2Gate(request, env); if (gate.response) return gate.response;
      await ensureNotificationTables(env);
      const exists = await env.DB.prepare('SELECT id FROM app_notifications WHERE id=? AND (target_user_id IS NULL OR target_user_id=?) LIMIT 1').bind(notificationReadMatch[1], gate.session!.id).first<{id:string}>();
      if (!exists) return v2Reply({error:'Nie znaleziono powiadomienia.'},404);
      await env.DB.prepare('INSERT INTO app_notification_reads(notification_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(notification_id,user_id) DO NOTHING').bind(notificationReadMatch[1], gate.session!.id, new Date().toISOString()).run();
      return v2Reply({ok:true});
    }

    // Każda ścieżka ACP jest weryfikowana po stronie Workera.
    if (path.startsWith('/api/v2/admin/')) {
      const gate = await v2Gate(request, env, true); if (gate.response) return gate.response;
      if (path === '/api/v2/admin/notifications' && method === 'GET') {
        await ensureNotificationTables(env);
        const rows = await env.DB.prepare(`SELECT n.id,n.title,n.message,n.target_user_id,n.created_at,u.email AS target_email FROM app_notifications n LEFT JOIN users u ON u.id=n.target_user_id ORDER BY n.created_at DESC LIMIT 100`).all();
        return v2Reply({notifications: rows.results || []});
      }
      if (path === '/api/v2/admin/notifications' && method === 'POST') {
        await ensureNotificationTables(env);
        const b = await v2Body(request), title = v2Field(b,'title',100), message = v2Field(b,'message',1200), targetEmail = v2Field(b,'target_email',254).toLowerCase();
        if (title.length < 2 || message.length < 3) return v2Reply({error:'Podaj tytuł i treść powiadomienia.'},400);
        let targetUserId: string | null = null;
        if (targetEmail) { const target = await env.DB.prepare('SELECT id FROM users WHERE lower(email)=? LIMIT 1').bind(targetEmail).first<{id:string}>(); if (!target) return v2Reply({error:'Nie znaleziono użytkownika o podanym e-mailu.'},404); targetUserId = target.id; }
        const id=crypto.randomUUID(), now=new Date().toISOString();
        await env.DB.prepare('INSERT INTO app_notifications(id,title,message,target_user_id,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id,title,message,targetUserId,gate.session!.id,now).run();
        await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gate.session!.id,gate.session!.email,'create_notification','notification',id,JSON.stringify({title,target_email:targetEmail||null}),now).run().catch(()=>{});
        return v2Reply({ok:true,id},201);
      }
      if (path === '/api/v2/admin/individual-plan-requests' && method === 'GET') {
        await ensureIndividualPlanRequestTable(env);
        const rows = await env.DB.prepare("SELECT r.*,COALESCE(d.display_number,o.order_number) AS display_order_number FROM individual_plan_requests r LEFT JOIN orders o ON o.id=r.order_id AND o.user_id=r.user_id LEFT JOIN order_display_numbers d ON d.order_id=o.id WHERE COALESCE(r.payment_status,'legacy') IN ('paid','legacy') ORDER BY CASE WHEN r.payment_status='paid' AND r.status='awaiting_questionnaire' THEN 0 WHEN r.status='in_preparation' THEN 1 WHEN r.status='ready' THEN 2 ELSE 3 END, r.created_at DESC LIMIT 300").all();
        return v2Reply({ requests: rows.results });
      }
      const individualPlanEditorMatch = path.match(/^\/api\/v2\/admin\/individual-plan-requests\/([a-f0-9-]+)\/plan$/i);
      if (individualPlanEditorMatch && ['PUT', 'POST'].includes(method)) {
        await ensureIndividualPlanRequestTable(env);
        const requestId = individualPlanEditorMatch[1];
        const requestRow = await env.DB.prepare('SELECT id,user_id,full_name,status,payment_status,training_plan_id FROM individual_plan_requests WHERE id=? LIMIT 1').bind(requestId).first<{id:string;user_id:string;full_name:string;status:string;payment_status:string;training_plan_id:string|null}>();
        if (!requestRow) return v2Reply({ error: 'Nie znaleziono zamówienia planu indywidualnego.' }, 404);
        if (!requestRow.user_id || !requestRow.user_id.trim()) return v2Reply({ error: 'To zgłoszenie nie ma przypisanego konta użytkownika. Nie zapisano planu.' }, 409);
        if (!['paid','legacy'].includes(requestRow.payment_status || 'legacy')) return v2Reply({ error: 'Plan można przypisać dopiero do opłaconego zamówienia.' }, 409);
        if (['canceled','refunded'].includes(requestRow.status)) return v2Reply({ error: 'Anulowanego lub zwróconego zamówienia nie można edytować.' }, 409);
        const b = await v2Body(request);
        const name = v2Field(b, 'name', 120), description = v2Field(b, 'description', 1000);
        const startDate = typeof b.start_date === 'string' ? b.start_date.trim() : new Date().toISOString().slice(0,10);
        const allowedProgressions = ['reps','weight','sets','none'];
        const progression = typeof b.progression_strategy === 'string' && allowedProgressions.includes(b.progression_strategy) ? b.progression_strategy : 'reps';
        const rawDays = Array.isArray(b.days) ? b.days : [];
        if (name.length < 2 || !v2ValidateDate(startDate)) return v2Reply({ error: 'Podaj nazwę planu i prawidłową datę rozpoczęcia.' }, 400);
        if (!rawDays.length || rawDays.length > 7) return v2Reply({ error: 'Plan musi mieć od 1 do 7 dni treningowych.' }, 400);
        const normalized: Array<{day_key:string;title:string;exercises:Array<{name:string;sets:number;reps:number;weight_kg:number|null;notes:string;rest_seconds:number;transition_rest_seconds:number;alternatives:string[]}>}> = [];
        for (const raw of rawDays) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return v2Reply({ error: 'Nieprawidłowy dzień planu.' }, 400);
          const d = raw as Record<string, unknown>;
          const dayKey = typeof d.day_key === 'string' ? d.day_key.trim().slice(0,30) : '';
          const title = typeof d.title === 'string' ? d.title.trim().slice(0,120) : '';
          const rawExercises = Array.isArray(d.exercises) ? d.exercises : [];
          if (!dayKey || !title || rawExercises.length > 40) return v2Reply({ error: 'Każdy dzień musi mieć nazwę i maksymalnie 40 ćwiczeń.' }, 400);
          const exercises: Array<{name:string;sets:number;reps:number;weight_kg:number|null;notes:string;rest_seconds:number;transition_rest_seconds:number;alternatives:string[]}> = [];
          for (const rawExercise of rawExercises) {
            if (!rawExercise || typeof rawExercise !== 'object' || Array.isArray(rawExercise)) return v2Reply({ error: 'Nieprawidłowe ćwiczenie.' }, 400);
            const x = rawExercise as Record<string, unknown>;
            const exerciseName = typeof x.name === 'string' ? x.name.trim().slice(0,120) : '';
            const sets = Number(x.sets ?? 3), reps = Number(x.reps ?? 10), rest = Number(x.rest_seconds ?? 90);
            const weight = x.weight_kg === '' || x.weight_kg == null ? null : Number(x.weight_kg);
            const notes = typeof x.notes === 'string' ? x.notes.trim().slice(0,500) : '';
            if (!exerciseName || !Number.isInteger(sets) || sets < 1 || sets > 30 || !Number.isInteger(reps) || reps < 1 || reps > 200 || !Number.isInteger(rest) || rest < 0 || rest > 600 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) return v2Reply({ error: 'Sprawdź nazwę ćwiczenia, liczbę serii/powtórzeń, przerwę i ciężar.' }, 400);
            exercises.push({ name: exerciseName, sets, reps, weight_kg: weight, notes, rest_seconds: rest, transition_rest_seconds: Number(x.transition_rest_seconds ?? 120), alternatives: Array.isArray(x.alternatives) ? x.alternatives.filter((v):v is string=>typeof v==='string').slice(0,3) : [] });
          }
          normalized.push({ day_key: dayKey, title, exercises });
        }
        const now = new Date().toISOString();
        let planId = requestRow.training_plan_id || '';
        if (planId) {
          const existingPlan = await env.DB.prepare('SELECT id FROM training_plans_v2 WHERE id=? AND user_id=? LIMIT 1').bind(planId, requestRow.user_id).first<{id:string}>();
          if (!existingPlan) planId = '';
        }
        const createPlan = !planId;
        if (createPlan) planId = crypto.randomUUID();
        const statements: D1PreparedStatement[] = [];
        if (createPlan) {
          statements.push(env.DB.prepare('INSERT INTO training_plans_v2(id,user_id,name,description,duration_weeks,start_date,progression_strategy,created_at,updated_at) VALUES(?,?,?,?,4,?,?,?,?)').bind(planId, requestRow.user_id, name, description, startDate, progression, now, now));
        } else {
          statements.push(env.DB.prepare('UPDATE training_plans_v2 SET name=?,description=?,duration_weeks=4,start_date=?,progression_strategy=?,updated_at=? WHERE id=? AND user_id=?').bind(name, description, startDate, progression, now, planId, requestRow.user_id));
          const oldDays = await env.DB.prepare('SELECT id FROM training_plan_days_v2 WHERE plan_id=?').bind(planId).all<{id:string}>();
          for (const day of oldDays.results) statements.push(env.DB.prepare('DELETE FROM training_plan_exercises_v2 WHERE day_id=?').bind(day.id));
          statements.push(env.DB.prepare('DELETE FROM training_plan_days_v2 WHERE plan_id=?').bind(planId));
        }
        normalized.forEach((day, dayIndex) => {
          const dayId = crypto.randomUUID();
          statements.push(env.DB.prepare('INSERT INTO training_plan_days_v2(id,plan_id,day_key,title,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(dayId, planId, day.day_key, day.title, dayIndex, now, now));
          day.exercises.forEach((exercise, exerciseIndex) => statements.push(env.DB.prepare('INSERT INTO training_plan_exercises_v2(id,day_id,name,sort_order,target_sets,target_reps,target_weight_kg,notes,rest_seconds,transition_rest_seconds,alternatives_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), dayId, exercise.name, exerciseIndex, exercise.sets, exercise.reps, exercise.weight_kg, exercise.notes, exercise.rest_seconds, exercise.transition_rest_seconds, JSON.stringify(exercise.alternatives))));
        });
        statements.push(env.DB.prepare('UPDATE individual_plan_requests SET training_plan_id=?,training_plan_name=?,training_plan_description=?,training_plan_start_date=?,training_plan_progression=?,training_plan_json=?,updated_at=? WHERE id=? AND user_id=?').bind(planId, name, description, startDate, progression, JSON.stringify(normalized), now, requestId, requestRow.user_id));
        await env.DB.batch(statements);
        return v2Reply({ ok: true, training_plan_id: planId, name, updated_at: now });
      }
      const individualRequestMatch = path.match(/^\/api\/v2\/admin\/individual-plan-requests\/([a-f0-9-]+)$/i);
      if (individualRequestMatch && method === 'PATCH') {
        await ensureIndividualPlanRequestTable(env);
        const b = await v2Body(request), status = v2Field(b, 'status', 30), adminNote = v2Field(b, 'admin_note', 4000);
        if (!['awaiting_questionnaire','in_preparation','ready','canceled','refunded'].includes(status)) return v2Reply({ error: 'Nieprawidłowy status zamówienia planu indywidualnego.' }, 400);
        const now = new Date().toISOString();
        const existing = await env.DB.prepare('SELECT id,user_id,status,training_plan_id,training_plan_json,training_plan_name FROM individual_plan_requests WHERE id=? LIMIT 1').bind(individualRequestMatch[1]).first<{id:string;user_id:string;status:string;training_plan_id:string|null;training_plan_json:string|null;training_plan_name:string|null}>();
        if (!existing) return v2Reply({ error: 'Nie znaleziono zamówienia planu indywidualnego.' }, 404);
        if (status === 'ready' && (!existing.training_plan_id || !existing.training_plan_json)) return v2Reply({ error: 'Najpierw zapisz plan treningowy w edytorze poniżej. Dopiero potem ustaw status „Zrealizowany”.' }, 409);
        const orderStatus = status === 'in_preparation' ? 'processing' : status === 'ready' ? 'fulfilled' : status === 'canceled' ? 'canceled' : status === 'refunded' ? 'refunded' : 'paid';
        const statements: D1PreparedStatement[] = [
          env.DB.prepare('UPDATE individual_plan_requests SET status=?,admin_note=?,updated_at=? WHERE id=?').bind(status, adminNote, now, individualRequestMatch[1]),
          env.DB.prepare(`UPDATE orders SET status=?,updated_at=? WHERE id=(SELECT order_id FROM individual_plan_requests WHERE id=?) AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=orders.id AND i.product_key=?)`).bind(orderStatus, now, individualRequestMatch[1], V2_INDIVIDUAL_PLAN_PRODUCT_KEY),
        ];
        if (existing.status !== status) {
          await ensureNotificationTables(env);
          if (status === 'in_preparation') statements.push(notificationInsert(env, existing.user_id, 'Twój plan jest realizowany', 'Rozpoczęliśmy przygotowanie Twojego planu indywidualnego. Status zamówienia został zmieniony na „W realizacji”.', now));
          else if (status === 'ready') statements.push(notificationInsert(env, existing.user_id, 'Twój plan jest gotowy', `Plan „${existing.training_plan_name || 'Plan indywidualny'}” został zrealizowany i przypisany do Twojego konta. Otwórz zakładkę Plan, aby go zobaczyć.`, now));
          else if (status === 'canceled') statements.push(notificationInsert(env, existing.user_id, 'Zamówienie anulowane', 'Twoje zamówienie planu indywidualnego zostało anulowane. W razie pytań skontaktuj się z obsługą.', now));
          else if (status === 'refunded') statements.push(notificationInsert(env, existing.user_id, 'Zwrot zamówienia', 'Status zamówienia planu indywidualnego zmieniono na „Zwrócono”.', now));
          else if (status === 'awaiting_questionnaire' && existing.status !== 'awaiting_questionnaire') statements.push(notificationInsert(env, existing.user_id, 'Potrzebujemy Twojej ankiety', 'Aby rozpocząć przygotowanie planu, dokończ ankietę w panelu klienta.', now));
        }
        const results = await env.DB.batch(statements);
        if (!results[0]?.meta?.changes) return v2Reply({ error: 'Nie udało się zapisać statusu zamówienia.' }, 500);
        // Status zamówienia i status realizacji są synchronizowane. E-mail wysyła administrator ręcznie poza aplikacją.
        return v2Reply({ ok: true, status, order_status: orderStatus, updated_at: now });
      }
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
      if (path === '/api/v2/admin/audit-log' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,actor_email,action,entity_type,entity_id,details_json,created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 100').all();
        return v2Reply({ entries: rows.results });
      }

      if (path === '/api/v2/admin/live-users' && method === 'GET') {
        const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
        await env.DB.prepare('DELETE FROM live_visitors WHERE last_seen < ?').bind(new Date(Date.now() - 3 * 60 * 1000).toISOString()).run();
        const summary = await env.DB.prepare('SELECT COUNT(*) AS active_visitors,COUNT(DISTINCT user_id) AS active_users FROM live_visitors WHERE last_seen >= ?').bind(cutoff).first<{active_visitors:number;active_users:number}>();
        const visitors = await env.DB.prepare('SELECT lv.session_key,lv.user_id,lv.path,lv.last_seen,u.email FROM live_visitors lv LEFT JOIN users u ON u.id=lv.user_id WHERE lv.last_seen >= ? ORDER BY lv.last_seen DESC LIMIT 100').bind(cutoff).all<{session_key:string;user_id:string|null;path:string;last_seen:string;email:string|null}>();
        return v2Reply({ active_visitors: summary?.active_visitors || 0, active_users: summary?.active_users || 0, visitors: visitors.results.map(v => ({ email: v.email || null, path: v.path, last_seen: v.last_seen, authenticated: Boolean(v.user_id) })) });
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
        await ensureSystemTrainingProducts(env);
        const rows = await env.DB.prepare("SELECT p.id,p.product_key,p.title,p.description,p.product_type,p.price_amount,p.currency,p.is_free,p.is_published,p.checkout_url,p.original_filename,p.file_key,COALESCE(m.category_slug,'inne') AS category_slug,COALESCE(m.target_audience,'') AS target_audience,COALESCE(m.contents_json,'[]') AS contents_json FROM products p LEFT JOIN product_metadata m ON m.product_key=p.product_key ORDER BY p.created_at DESC").all();
        const components = await env.DB.prepare('SELECT bundle_key,component_product_key,quantity,sort_order FROM bundle_items ORDER BY bundle_key,sort_order').all();
        let categories = await env.DB.prepare('SELECT slug,title,description,is_active,sort_order FROM product_categories ORDER BY sort_order,title').all();
        return v2Reply({ products: rows.results, components: components.results, categories: categories.results });
      }
      const adminProductMatch = path.match(/^\/api\/v2\/admin\/products\/([a-z0-9-]+)$/);
      if (adminProductMatch && method === 'DELETE') {
        const key = adminProductMatch[1];
        const item = await v2Product(env, key);
        if (!item) return v2Reply({ error: 'Nie znaleziono produktu.' }, 404);
        const protectedKeys = [V2_GENERATOR_PRODUCT_KEY, V2_INDIVIDUAL_PLAN_PRODUCT_KEY];
        if (protectedKeys.includes(key)) {
          return v2Reply({ error: 'To produkt systemowy wymagany przez aplikację. Nie można go trwale usunąć z ACP. Jego działanie i dostępność są zarządzane przez moduł aplikacji.' }, 409);
        }

        const [orderItems, entitlements, bundleLinks, promotions, challengeTable] = await Promise.all([
          env.DB.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_key=?').bind(key).first<{ count: number }>(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM user_entitlements WHERE product_key=?').bind(key).first<{ count: number }>(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM bundle_items WHERE bundle_key=? OR component_product_key=?').bind(key, key).first<{ count: number }>(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM promotion_codes WHERE product_key=?').bind(key).first<{ count: number }>(),
          env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sf_challenges' LIMIT 1").first<{ name: string }>(),
        ]);
        let challengeRefs = 0;
        if (challengeTable) {
          const result = await env.DB.prepare('SELECT COUNT(*) AS count FROM sf_challenges WHERE product_key=?').bind(key).first<{ count: number }>();
          challengeRefs = Number(result?.count || 0);
        }
        const referenceCount = Number(bundleLinks?.count || 0) + Number(promotions?.count || 0) + challengeRefs;
        const hasHistory = Number(orderItems?.count || 0) > 0 || Number(entitlements?.count || 0) > 0;
        const hasDependencies = referenceCount > 0;
        const now = new Date().toISOString();

        // Nie kasujemy rekordu, do którego odwołuje się historia transakcji, dostęp użytkownika,
        // pakiet, wyzwanie albo kod rabatowy. W takim przypadku „Usuń produkt” archiwizuje go,
        // czyli ukrywa w katalogu i zachowuje referencje oraz możliwość pobrania wcześniej kupionych plików.
        if (hasHistory || hasDependencies) {
          await env.DB.prepare('UPDATE products SET is_published=0,updated_at=? WHERE product_key=?').bind(now, key).run();
          const reasons = [
            hasHistory ? 'historia zamówień lub przypisane dostępy klientów' : '',
            Number(bundleLinks?.count || 0) ? 'powiązanie z pakietem' : '',
            challengeRefs ? 'powiązanie z wyzwaniem' : '',
            Number(promotions?.count || 0) ? 'powiązanie z kodem rabatowym' : '',
          ].filter(Boolean);
          const message = `Produkt został ukryty zamiast trwale usunięty, ponieważ ma ${reasons.join(', ')}. Historia i uprawnienia klientów zostały zachowane.`;
          await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
            .bind(crypto.randomUUID(), gate.session!.id, gate.session!.email, 'archive_product', 'product', key, JSON.stringify({ title: item.title, reasons }), now).run().catch(() => {});
          return v2Reply({ ok: true, archived: true, deleted: false, message });
        }

        const metadata = await env.DB.prepare('SELECT cover_key FROM product_metadata WHERE product_key=? LIMIT 1').bind(key).first<{ cover_key: string | null }>();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM product_discounts WHERE product_key=?').bind(key),
          env.DB.prepare('DELETE FROM product_metadata WHERE product_key=?').bind(key),
          env.DB.prepare('DELETE FROM bundle_items WHERE bundle_key=? OR component_product_key=?').bind(key, key),
          env.DB.prepare('UPDATE promotion_codes SET is_active=0,updated_at=? WHERE product_key=?').bind(now, key),
          env.DB.prepare('DELETE FROM products WHERE product_key=?').bind(key),
          env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), gate.session!.id, gate.session!.email, 'delete_product', 'product', key, JSON.stringify({ title: item.title, permanent: true }), now),
        ]);
        if (env.PRODUCT_FILES) {
          if (item.file_key) await env.PRODUCT_FILES.delete(item.file_key).catch(() => {});
          if (metadata?.cover_key) await env.PRODUCT_FILES.delete(metadata.cover_key).catch(() => {});
        }
        return v2Reply({ ok: true, deleted: true, archived: false, message: `Produkt „${item.title}” został trwale usunięty.` });
      }
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
      if (path === '/api/v2/admin/product-discounts' && method === 'GET') { const gate=await v2Gate(request,env,true);if(gate.response)return gate.response; const rows=await env.DB.prepare('SELECT product_key,discount_percent,starts_at,ends_at,is_active,updated_at FROM product_discounts ORDER BY updated_at DESC').all();return v2Reply({discounts:rows.results}); }
      const productDiscountMatch=path.match(/^\/api\/v2\/admin\/product-discounts\/([a-z0-9-]+)$/i);
      if(productDiscountMatch && ['PUT','DELETE'].includes(method)){const gate=await v2Gate(request,env,true);if(gate.response)return gate.response;const key=productDiscountMatch[1];if(!(await v2Product(env,key)))return v2Reply({error:'Nie znaleziono produktu.'},404);if(method==='DELETE'){await env.DB.prepare('DELETE FROM product_discounts WHERE product_key=?').bind(key).run();return v2Reply({ok:true});}const b=await v2Body(request),percent=Number(b.discount_percent),starts=typeof b.starts_at==='string'?b.starts_at:'',ends=typeof b.ends_at==='string'?b.ends_at:'',active=b.is_active!==false;if(!Number.isInteger(percent)||percent<1||percent>99||(starts&&Number.isNaN(Date.parse(starts)))||(ends&&Number.isNaN(Date.parse(ends)))||(starts&&ends&&Date.parse(starts)>=Date.parse(ends)))return v2Reply({error:'Rabat musi wynosić 1–99%, a data końcowa musi być późniejsza niż początkowa.'},400);const now=new Date().toISOString();await env.DB.prepare('INSERT INTO product_discounts(product_key,discount_percent,starts_at,ends_at,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(product_key) DO UPDATE SET discount_percent=excluded.discount_percent,starts_at=excluded.starts_at,ends_at=excluded.ends_at,is_active=excluded.is_active,updated_at=excluded.updated_at').bind(key,percent,starts||null,ends||null,active?1:0,now,now).run();await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gate.session!.id,gate.session!.email,'update_product_discount','product_discount',key,JSON.stringify({discount_percent:percent,starts_at:starts||null,ends_at:ends||null,is_active:active}),now).run().catch(()=>{});return v2Reply({ok:true});}
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
        const gate = await v2Gate(request, env, true); if (gate.response) return gate.response;
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
      // Zarządzanie kontem: edycja e-maila, reset hasła, nadawanie i odbieranie dostępu.
      const userMutation = path.match(/^\/api\/v2\/admin\/users\/([a-f0-9-]+)$/i);
      if (userMutation && ['PATCH','DELETE'].includes(method)) {
        const gate = await v2Gate(request, env, true); if (gate.response) return gate.response;
        const userId = userMutation[1];
        const target = await env.DB.prepare('SELECT id,email FROM users WHERE id=? LIMIT 1').bind(userId).first<{id:string;email:string}>();
        if (!target) return v2Reply({error:'Nie znaleziono użytkownika.'},404);
        if (method === 'DELETE') {
          if (target.email.trim().toLowerCase() === (env.ADMIN_EMAIL || '').trim().toLowerCase()) return v2Reply({error:'Nie można usunąć konta administratora.'},400);
          // Tabela zależne są sprawdzane przed budowaniem DELETE. Dzięki temu starsze
          // albo nieużywane tabele nie powodują 500 podczas usuwania konta.
          const deleteTableNames = [
            'orders','order_items','order_display_numbers','promotion_redemptions','auth_sessions','user_entitlements',
            'user_profiles','workout_sessions','training_plans_v2','training_plan_days_v2','training_plan_exercises_v2',
            'training_session_drafts','individual_plan_requests','support_tickets','product_analytics','weekly_checkins',
            'user_goals','user_measurements','app_notification_reads','app_notifications','sf_challenge_day_logs',
            'sf_challenge_participants','premium_trials','premium_subscriptions','users'
          ];
          const tableInfo = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${deleteTableNames.map(()=>'?').join(',')})`)
            .bind(...deleteTableNames).all<{name:string}>();
          const existingTables = new Set((tableInfo.results || []).map(row => row.name));
          // Nie usuwamy konta z aktywną subskrypcją pozostawioną w Stripe, bo mogłoby to
          // odciąć możliwość prawidłowego powiązania odnowień/anulowania z użytkownikiem.
          if (existingTables.has('premium_subscriptions')) {
            const activeSubscription = await env.DB.prepare(`SELECT stripe_subscription_id FROM premium_subscriptions
              WHERE user_id=? AND status IN ('active','trialing','past_due')
              AND (current_period_end IS NULL OR current_period_end>?) LIMIT 1`)
              .bind(userId,new Date().toISOString()).first<{stripe_subscription_id:string}>();
            if (activeSubscription) return v2Reply({error:'Konto ma aktywną subskrypcję Premium. Anuluj ją w Stripe i poczekaj na aktualizację statusu przed usunięciem użytkownika.'},409);
          }
          const statements:D1PreparedStatement[]=[];
          const addDelete = (table:string, sql:string, values:unknown[]=[userId]) => {
            if (existingTables.has(table)) statements.push(env.DB.prepare(sql).bind(...values));
          };
          if (existingTables.has('order_items') && existingTables.has('orders')) {
            addDelete('order_items','DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=?)');
          }
          if (existingTables.has('order_display_numbers') && existingTables.has('orders')) {
            addDelete('order_display_numbers','DELETE FROM order_display_numbers WHERE order_id IN (SELECT id FROM orders WHERE user_id=?)');
          }
          for (const table of [
            'promotion_redemptions','auth_sessions','user_entitlements','user_profiles','workout_sessions',
            'training_session_drafts','individual_plan_requests','support_tickets','product_analytics',
            'weekly_checkins','user_goals','user_measurements','app_notification_reads','sf_challenge_day_logs',
            'sf_challenge_participants','premium_trials','premium_subscriptions'
          ]) addDelete(table,`DELETE FROM ${table} WHERE user_id=?`);
          if (existingTables.has('app_notifications')) {
            addDelete('app_notifications','DELETE FROM app_notifications WHERE target_user_id=?');
          }
          if (existingTables.has('training_plan_exercises_v2') && existingTables.has('training_plan_days_v2') && existingTables.has('training_plans_v2')) {
            addDelete('training_plan_exercises_v2','DELETE FROM training_plan_exercises_v2 WHERE day_id IN (SELECT id FROM training_plan_days_v2 WHERE plan_id IN (SELECT id FROM training_plans_v2 WHERE user_id=?))');
          }
          if (existingTables.has('training_plan_days_v2') && existingTables.has('training_plans_v2')) {
            addDelete('training_plan_days_v2','DELETE FROM training_plan_days_v2 WHERE plan_id IN (SELECT id FROM training_plans_v2 WHERE user_id=?)');
          }
          if (existingTables.has('training_plans_v2')) addDelete('training_plans_v2','DELETE FROM training_plans_v2 WHERE user_id=?');
          if (existingTables.has('orders')) addDelete('orders','DELETE FROM orders WHERE user_id=?');
          addDelete('users','DELETE FROM users WHERE id=?');
          if (!existingTables.has('users')) return v2Reply({error:'Nie można usunąć konta: tabela użytkowników jest niedostępna.'},500);
          await env.DB.batch(statements);
          return v2Reply({ok:true,deleted:true});
        }
        const b=await v2Body(request), email=v2Field(b,'email',254).toLowerCase(), password=v2Field(b,'new_password',128);
        const hasProfileFields=['first_name','gender','weight_kg','height_cm','training_location','primary_goal','training_days_per_week'].some(k=>Object.prototype.hasOwnProperty.call(b,k));
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return v2Reply({error:'Podaj prawidłowy adres e-mail.'},400);
        if (password && (password.length<8 || password.length>128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password))) return v2Reply({error:'Hasło musi mieć 8–128 znaków oraz wielką i małą literę, cyfrę i znak specjalny.'},400);
        if (password && (!env.AUTH_PASSWORD_PEPPER || env.AUTH_PASSWORD_PEPPER.length<32)) return v2Reply({error:'Reset hasła jest niedostępny: sprawdź sekret AUTH_PASSWORD_PEPPER w Cloudflare (minimum 32 znaki).'},503);
        if (email && email!==target.email.toLowerCase()) { const duplicate=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>? LIMIT 1').bind(email,userId).first(); if(duplicate)return v2Reply({error:'Ten e-mail jest już używany.'},409); }
        const now=new Date().toISOString();
        if(email) await env.DB.prepare('UPDATE users SET email=?,updated_at=? WHERE id=?').bind(email,now,userId).run();
        if(password) { const saltBytes=crypto.getRandomValues(new Uint8Array(16)); const salt=btoa(String.fromCharCode(...saltBytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`${password}\u0000${env.AUTH_PASSWORD_PEPPER}`),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(atob(salt.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-salt.length%4)%4)),c=>c.charCodeAt(0)),iterations:100000,hash:'SHA-256'},key,256); const hash=btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); await env.DB.prepare('UPDATE users SET password_salt=?,password_hash=?,updated_at=? WHERE id=?').bind(salt,hash,now,userId).run(); await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(userId).run(); }
        if(hasProfileFields) {
          const profile=await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id=?').bind(userId).first<{user_id:string}>();
          const firstName=v2Field(b,'first_name',80), gender=v2Field(b,'gender',30), trainingLocation=v2Field(b,'training_location',30), primaryGoal=v2Field(b,'primary_goal',30);
          const num=(key:string,min:number,max:number)=>{const raw=b[key];if(raw===null||raw===''||raw===undefined)return null;const value=Number(raw);if(!Number.isFinite(value)||value<min||value>max)return NaN;return value;};
          const weight=num('weight_kg',20,400), height=num('height_cm',80,260), days=num('training_days_per_week',1,7);
          if(!['','female','male','other','prefer_not_to_say'].includes(gender)||!['','gym','home','both'].includes(trainingLocation)||!['','muscle','fat_loss','strength','consistency','health'].includes(primaryGoal)||Number.isNaN(weight)||Number.isNaN(height)||Number.isNaN(days)||(days!==null&&!Number.isInteger(days))) return v2Reply({error:'Sprawdź dane profilu: płeć, cel, miejsce treningu, wagę, wzrost i liczbę treningów (1–7).'},400);
          if(profile) await env.DB.prepare('UPDATE user_profiles SET first_name=?,gender=?,weight_kg=?,height_cm=?,training_location=?,primary_goal=?,training_days_per_week=?,updated_at=? WHERE user_id=?').bind(firstName,gender,weight,height,trainingLocation,primaryGoal,days,now,userId).run();
          else await env.DB.prepare('INSERT INTO user_profiles(user_id,first_name,gender,weight_kg,height_cm,training_location,primary_goal,training_days_per_week,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(userId,firstName,gender,weight,height,trainingLocation,primaryGoal,days,now,now).run();
        }
        await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gate.session!.id,gate.session!.email,'update_user','user',userId,JSON.stringify({target_email:email||target.email,password_reset:Boolean(password),profile_updated:hasProfileFields}),now).run().catch(()=>{});
        return v2Reply({ok:true});
      }
      const accessMutation = path.match(/^\/api\/v2\/admin\/users\/([a-f0-9-]+)\/access$/i);
      if(accessMutation && method==='POST') {
        const gate=await v2Gate(request,env,true); if(gate.response)return gate.response;
        const userId=accessMutation[1],b=await v2Body(request),key=v2Field(b,'product_key',100),active=b.active!==false;
        const user=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(); const item=await v2Product(env,key);
        if(!user||!item)return v2Reply({error:'Nie znaleziono użytkownika lub produktu.'},404);
        if(active) { const existing=await env.DB.prepare('SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? LIMIT 1').bind(userId,key).first<{id:string}>(); if(existing) await env.DB.prepare("UPDATE user_entitlements SET access_status='active' WHERE id=?").bind(existing.id).run(); else await env.DB.prepare("INSERT INTO user_entitlements(id,user_id,product_key,product_title,product_type,access_status,created_at) VALUES(?,?,?,?,?,'active',?)").bind(crypto.randomUUID(),userId,key,item.title,item.product_type,new Date().toISOString()).run(); }
        else await env.DB.prepare("UPDATE user_entitlements SET access_status='revoked' WHERE user_id=? AND product_key=?").bind(userId,key).run();
        await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gate.session!.id,gate.session!.email,active?'grant_user_access':'revoke_user_access','user_entitlement',userId,JSON.stringify({product_key:key,active}),new Date().toISOString()).run().catch(()=>{});
        return v2Reply({ok:true});
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
        if (!/^[A-Z0-9_-]{3,80}$/.test(code) || !['percent', 'fixed'].includes(type) || !Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100) || (type === 'fixed' && value > 100000) || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) || (starts && Number.isNaN(Date.parse(starts)) || ends && Number.isNaN(Date.parse(ends)))) return v2Reply({ error: 'Sprawdź kod, typ rabatu, wartość, daty oraz limit użyć.' }, 400);
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
      // Dedicated site-lock password endpoint: separates password hashing from general settings saves.
      if (path === '/api/v2/admin/site-lock/password' && method === 'POST') {
        const b = await v2Body(request);
        const password = typeof b.password === 'string' ? b.password : '';
        if (password.length < 8 || password.length > 200) {
          return v2Reply({ error: 'Hasło blokady musi mieć od 8 do 200 znaków.' }, 400);
        }
        const now = new Date().toISOString();
        const hash = await v2SitePasswordHash(password);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind('site_lock_password_hash', hash, now),
          env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind('site_lock_enabled', 'true', now),
        ]);
        await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), gate.session!.id, gate.session!.email, 'set_site_lock_password', 'settings', 'site_lock', '{}', now).run().catch(() => {});
        return v2Reply({ ok: true, enabled: true });
      }
      if (path === '/api/v2/admin/settings' && method === 'GET') {
        const rows = await env.DB.prepare("SELECT setting_key,setting_value,updated_at FROM app_settings WHERE setting_key<>'site_lock_password_hash' ORDER BY setting_key").all(); return v2Reply({ settings: rows.results });
      }
      if (path === '/api/v2/admin/settings' && method === 'PUT') {
        const b = await v2Body(request), settings = b.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return v2Reply({ error: 'Nieprawidłowe ustawienia.' }, 400);
        const allowed = ['support_email','store_notice','analytics_enabled','site_lock_enabled','maintenance_message','maintenance_until']; const now = new Date().toISOString(), statements: D1PreparedStatement[] = [];
        const lockPassword=(settings as Record<string,unknown>).site_lock_password;
        const requestedLock=(settings as Record<string,unknown>).site_lock_enabled;
        // Blank password means "leave the current password unchanged"; it must never delete the stored hash.
        if (requestedLock === 'true' && (typeof lockPassword !== 'string' || lockPassword.length === 0)) {
          const currentHash = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='site_lock_password_hash'").first<{setting_value:string}>();
          if (!currentHash?.setting_value) return v2Reply({error:'Najpierw ustaw hasło blokady przyciskiem „Ustaw hasło blokady”, a dopiero potem włącz blokadę.'},400);
        }
        if (lockPassword !== undefined && typeof lockPassword !== 'string') return v2Reply({error:'Nieprawidłowe hasło blokady.'},400);
        if (typeof lockPassword === 'string' && lockPassword.length > 0) {
          if (lockPassword.length < 8 || lockPassword.length > 200) return v2Reply({error:'Hasło blokady musi mieć od 8 do 200 znaków.'},400);
          const hash = await v2SitePasswordHash(lockPassword);
          statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind('site_lock_password_hash',hash,now));
        }
        const maintenanceUntil=(settings as Record<string,unknown>).maintenance_until; if(maintenanceUntil!==undefined && maintenanceUntil!=='' && (typeof maintenanceUntil!=='string' || Number.isNaN(Date.parse(maintenanceUntil)))) return v2Reply({error:'Podaj prawidłowy termin zakończenia prac.'},400);
        for (const key of allowed) { const value = (settings as Record<string, unknown>)[key]; if (value === undefined) continue; if (typeof value !== 'string' || value.length > 1000) return v2Reply({ error: `Nieprawidłowa wartość ustawienia ${key}.` }, 400); statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind(key,value,now)); }
        if (statements.length) await env.DB.batch(statements);
        await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,actor_email,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gate.session!.id,gate.session!.email,'update_settings','settings','site',JSON.stringify({keys:Object.keys(settings as Record<string,unknown>).filter(k=>k!=='site_lock_password')}),now).run().catch(()=>{});
        return v2Reply({ ok: true });
      }
      return v2Reply({ error: 'Nie znaleziono endpointu administracyjnego.' }, 404);
    }
    return null;
  } catch (error) {
    if (error instanceof V2InputError) return v2Reply({ error: error.message }, error.status);
    console.error('System Formy V2 API error:', error instanceof Error ? `${error.name}: ${error.message}` : String(error), error instanceof Error ? error.stack : '');
    return v2Reply({ error: 'Wystąpił błąd serwera. Spróbuj ponownie.' }, 500);
  }
}
