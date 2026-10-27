import { handlePlatformApi, handleSitePageLock } from './platform';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  AUTH_PASSWORD_PEPPER?: string;
  ADMIN_EMAIL?: string;
  PRODUCT_FILES?: R2Bucket;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}
type PublicUser = { id: string; email: string };
type UserRow = PublicUser & { password_hash: string; password_salt: string };
type SessionRow = { id: string; user_id: string; expires_at: number; email: string };
type JsonRecord = Record<string, unknown>;
const SESSION_COOKIE = 'sf_session';
const REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_ITERATIONS = 100_000;

const MAX_API_BODY_BYTES = 1 * 1024 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = 27 * 1024 * 1024;

function addSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  const contentType = headers.get('Content-Type') || '';
  if (contentType.toLowerCase().includes('text/html')) {
    if (!headers.has('Content-Security-Policy')) {
      headers.set('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self' https://checkout.stripe.com",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        'upgrade-insecure-requests',
      ].join('; '));
    }
    // Avoid stale application shells after deployment; hashed assets remain cacheable.
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function requestBodyLimit(request: Request, path: string): number {
  if (path === '/api/stripe/webhook') return MAX_WEBHOOK_BODY_BYTES;
  if (path === '/api/admin/products' && request.method.toUpperCase() === 'POST') return MAX_UPLOAD_BODY_BYTES;
  if ((path.startsWith('/api/v2/admin/products/') && path.endsWith('/file')) || path === '/api/v2/admin/covers') return MAX_UPLOAD_BODY_BYTES;
  return MAX_API_BODY_BYTES;
}

function requestJsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}
function publicUser(row: { id: string; email: string }): PublicUser { return { id: row.id, email: row.email }; }
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function randomToken(bytes = 32): string { return base64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function makePasswordHash(password: string, pepper: string, salt = randomToken(16)): Promise<{ salt: string; hash: string }> {
  const pepperedPassword = `${password}\u0000${pepper}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepperedPassword), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64Url(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return { salt, hash: base64Url(new Uint8Array(bits)) };
}
async function passwordMatches(password: string, salt: string, expected: string, pepper: string): Promise<boolean> {
  const computed = await makePasswordHash(password, pepper, salt);
  const left = new TextEncoder().encode(computed.hash), right = new TextEncoder().encode(expected);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}
function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}
function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
function rememberFlagCookie(request: Request, rememberMe: boolean, maxAgeSeconds?: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const ttl = maxAgeSeconds ?? Math.floor((rememberMe ? REMEMBER_TTL_MS : IDLE_TTL_MS) / 1000);
  return `sf_remember=${rememberMe ? '1' : '0'}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`;
}
function appendCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function readBoundedText(request: Request, maxBytes = MAX_API_BODY_BYTES): Promise<string> {
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
      throw new HttpError(413, 'Wysłane dane są zbyt duże.');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function readJson(request: Request): Promise<JsonRecord> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().includes('application/json')) throw new HttpError(415, 'Wysłane dane muszą być w formacie JSON.');
  try {
    const value: unknown = JSON.parse(await readBoundedText(request));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
    return value as JsonRecord;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Nie udało się odczytać danych formularza.');
  }
}
function stringField(body: JsonRecord, key: string): string { return typeof body[key] === 'string' ? (body[key] as string).trim() : ''; }
function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }
function validEmail(value: string): boolean { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validStrongPassword(value: string): boolean { return value.length >= 8 && value.length <= 128 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value); }
function requireDb(env: Env): D1Database {
  if (!env.DB) throw new HttpError(503, 'Baza danych nie jest skonfigurowana. Sprawdź binding DB w Cloudflare.');
  return env.DB;
}
function requirePasswordPepper(env: Env): string {
  if (!env.AUTH_PASSWORD_PEPPER || env.AUTH_PASSWORD_PEPPER.length < 32) throw new HttpError(503, 'Logowanie nie jest skonfigurowane. Sprawdź sekret AUTH_PASSWORD_PEPPER.');
  return env.AUTH_PASSWORD_PEPPER;
}
function safeFailure(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('System Formy API error:', error);
  return json({ error: 'Wystąpił błąd serwera. Sprawdź konfigurację i spróbuj ponownie.' }, 500);
}
async function applyRateLimit(request: Request, db: D1Database, route: string, limit: number): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local-development';
  const scope = `${route}:${await sha256(ip)}`;
  const now = Date.now(), windowStart = now - 15 * 60 * 1000;
  await db.prepare('DELETE FROM auth_rate_limit_events WHERE created_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
  const row = await db.prepare('SELECT COUNT(*) AS total FROM auth_rate_limit_events WHERE scope = ? AND created_at >= ?').bind(scope, windowStart).first<{ total: number }>();
  if ((row?.total ?? 0) >= limit) throw new HttpError(429, 'Wykonano zbyt wiele prób. Odczekaj 15 minut i spróbuj ponownie.');
  await db.prepare('INSERT INTO auth_rate_limit_events (scope, created_at) VALUES (?, ?)').bind(scope, now).run();
}
async function currentSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const db = requireDb(env), tokenHash = await sha256(token), now = Date.now();
  const row = await db.prepare(`SELECT s.id, s.user_id, s.expires_at, u.email
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`).bind(tokenHash, now).first<SessionRow>();
  if (!row) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
  return row ?? null;
}
async function requireSession(request: Request, env: Env): Promise<SessionRow> {
  const session = await currentSession(request, env);
  if (!session) throw new HttpError(401, 'Sesja wygasła. Zaloguj się ponownie.');
  return session;
}
async function createSession(request: Request, env: Env, user: PublicUser, rememberMe = false): Promise<Response> {
  const db = requireDb(env), token = randomToken(32), now = Date.now();
  const ttl = rememberMe ? REMEMBER_TTL_MS : IDLE_TTL_MS;
  // Do not depend on an optional remember_me database column. The flag lives in a separate
  // HttpOnly cookie, keeping this code compatible with existing and freshly migrated D1 schemas.
  await db.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, await sha256(token), now + ttl, new Date(now).toISOString()).run();
  const response = json({ user }, 200, { 'Set-Cookie': sessionCookie(request, token, Math.floor(ttl / 1000)) });
  return appendCookie(response, rememberFlagCookie(request, rememberMe));
}
async function refreshRollingSessionCookie(request: Request, env: Env, response: Response): Promise<Response> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token || !new URL(request.url).pathname.startsWith('/api/')) return response;
  try {
    const tokenHash = await sha256(token), now = Date.now(), db = requireDb(env);
    const row = await db.prepare('SELECT id FROM auth_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1')
      .bind(tokenHash, now).first<{ id: string }>();
    if (!row) return response;
    const rememberMe = parseCookie(request, 'sf_remember') === '1';
    const ttl = rememberMe ? REMEMBER_TTL_MS : IDLE_TTL_MS;
    await db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?').bind(now + ttl, tokenHash, now).run();
    let refreshed = appendCookie(response, sessionCookie(request, token, Math.floor(ttl / 1000)));
    refreshed = appendCookie(refreshed, rememberFlagCookie(request, rememberMe));
    return refreshed;
  } catch { return response; }
}
async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
  if (path === '/api/health' && method === 'GET') {
    try {
      const db = requireDb(env); await db.prepare('SELECT 1 AS ok').first();
      return json({ ok: true, database: 'connected', passwordAuthConfigured: Boolean(env.AUTH_PASSWORD_PEPPER && env.AUTH_PASSWORD_PEPPER.length >= 32), productFilesConfigured: Boolean(env.PRODUCT_FILES), adminConfigured: Boolean(env.ADMIN_EMAIL) });
    } catch (error) { return safeFailure(error); }
  }
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Żądanie pochodzi z nieprawidłowej strony.' }, 403);
  }
  try {
    const db = requireDb(env);
    if (path === '/api/auth/me' && method === 'GET') {
      const session = await currentSession(request, env);
      return json({ user: session ? { id: session.user_id, email: session.email } : null });
    }
    if (path === '/api/account/profile' && method === 'GET') {
      const session = await requireSession(request, env);
      const row = await db.prepare(`SELECT first_name, gender, weight_kg, height_cm, training_location, primary_goal, training_days_per_week
        FROM user_profiles WHERE user_id = ? LIMIT 1`).bind(session.user_id).first<{
          first_name: string; gender: string; weight_kg: number | null; height_cm: number | null; training_location: string; primary_goal: string; training_days_per_week: number | null;
        }>();
      return json({ has_profile: Boolean(row), profile: row ?? { first_name: '', gender: '', weight_kg: null, height_cm: null, training_location: '', primary_goal: '', training_days_per_week: null } });
    }
    if (path === '/api/account/profile' && method === 'PUT') {
      const session = await requireSession(request, env), body = await readJson(request);
      const firstName = stringField(body, 'first_name'), gender = stringField(body, 'gender'), trainingLocation = stringField(body, 'training_location'), primaryGoal = stringField(body, 'primary_goal');
      const weightKg = body.weight_kg == null || body.weight_kg === '' ? null : Number(body.weight_kg);
      const heightCm = body.height_cm == null || body.height_cm === '' ? null : Number(body.height_cm);
      const trainingDays = body.training_days_per_week == null || body.training_days_per_week === '' ? null : Number(body.training_days_per_week);
      if (firstName.length > 80) throw new HttpError(400, 'Imię może mieć maksymalnie 80 znaków.');
      if (!['', 'female', 'male', 'other', 'prefer_not_to_say'].includes(gender)) throw new HttpError(400, 'Wybierz prawidłową wartość pola płci.');
      if (!['', 'gym', 'home', 'both'].includes(trainingLocation)) throw new HttpError(400, 'Wybierz prawidłowe miejsce treningu.');
      if (!['', 'muscle', 'fat_loss', 'strength', 'consistency', 'health'].includes(primaryGoal)) throw new HttpError(400, 'Wybierz prawidłowy cel treningowy.');
      if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400)) throw new HttpError(400, 'Waga musi mieścić się w zakresie 20–400 kg.');
      if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 260)) throw new HttpError(400, 'Wzrost musi mieścić się w zakresie 80–260 cm.');
      if (trainingDays !== null && (!Number.isInteger(trainingDays) || trainingDays < 1 || trainingDays > 7)) throw new HttpError(400, 'Liczba treningów musi wynosić od 1 do 7 tygodniowo.');
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO user_profiles (user_id, first_name, gender, weight_kg, height_cm, training_location, primary_goal, training_days_per_week, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name, gender=excluded.gender, weight_kg=excluded.weight_kg,
        height_cm=excluded.height_cm, training_location=excluded.training_location, primary_goal=excluded.primary_goal,
        training_days_per_week=excluded.training_days_per_week, updated_at=excluded.updated_at`)
        .bind(session.user_id, firstName, gender, weightKg, heightCm, trainingLocation, primaryGoal, trainingDays, now, now).run();
      return json({ has_profile: true, profile: { first_name: firstName, gender, weight_kg: weightKg, height_cm: heightCm, training_location: trainingLocation, primary_goal: primaryGoal, training_days_per_week: trainingDays } });
    }
    if (path === '/api/auth/change-password' && method === 'POST') {
      const session = await requireSession(request, env); await applyRateLimit(request, db, 'change-password', 6);
      const body = await readJson(request), currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '', newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!currentPassword || currentPassword.length > 128) throw new HttpError(400, 'Podaj obecne hasło.');
      if (!validStrongPassword(newPassword)) throw new HttpError(400, 'Nowe hasło musi mieć od 8 do 128 znaków oraz zawierać wielką i małą literę, cyfrę i znak specjalny.');
      if (currentPassword === newPassword) throw new HttpError(400, 'Nowe hasło musi być inne niż obecne.');
      const user = await db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ? LIMIT 1').bind(session.user_id).first<{ password_hash: string; password_salt: string }>();
      if (!user || !(await passwordMatches(currentPassword, user.password_salt, user.password_hash, requirePasswordPepper(env)))) throw new HttpError(401, 'Obecne hasło jest nieprawidłowe.');
      const { salt, hash } = await makePasswordHash(newPassword, requirePasswordPepper(env));
      await db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').bind(hash, salt, new Date().toISOString(), session.user_id).run();
      await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(session.user_id).run();
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
    }
    if (path === '/api/auth/register' && method === 'POST') {
      await applyRateLimit(request, db, 'register', 8);
      const body = await readJson(request), email = normalizedEmail(stringField(body, 'email')), password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email)) throw new HttpError(400, 'Podaj prawidłowy adres e-mail.');
      if (!validStrongPassword(password)) throw new HttpError(400, 'Hasło musi mieć od 8 do 128 znaków i zawierać wielką oraz małą literę, cyfrę i znak specjalny.');
      if (await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first()) throw new HttpError(409, 'Konto z tym adresem e-mail już istnieje.');
      const { salt, hash } = await makePasswordHash(password, requirePasswordPepper(env)), user = { id: crypto.randomUUID(), email }, now = new Date().toISOString();
      // Przygotuj tabelę przed insertem konta, aby nie zostawić użytkownika bez sesji, gdyby DDL zawiodło.
      await db.prepare(`CREATE TABLE IF NOT EXISTS premium_trials (
        user_id TEXT PRIMARY KEY NOT NULL,
        started_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`).run();
      // Jednorazowe trzydniowe Premium wyłącznie dla nowego konta. Nie uruchamiamy płatności ani automatycznego odnowienia.
      const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await db.batch([
        db.prepare('INSERT INTO users (id, email, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, email, hash, salt, now, now),
        db.prepare('INSERT OR IGNORE INTO premium_trials(user_id,started_at,ends_at,created_at) VALUES(?,?,?,?)').bind(user.id, now, trialEndsAt, now),
      ]);
      return createSession(request, env, user, false);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      await applyRateLimit(request, db, 'login', 12);
      const body = await readJson(request), email = normalizedEmail(stringField(body, 'email')), password = typeof body.password === 'string' ? body.password : '', rememberMe = body.rememberMe === true;
      if (!validEmail(email) || !password || password.length > 128) throw new HttpError(400, 'Podaj prawidłowy e-mail i hasło.');
      const pepper = requirePasswordPepper(env), user = await db.prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ? LIMIT 1').bind(email).first<UserRow>();
      if (!user) { await makePasswordHash(password, pepper, 'AAAAAAAAAAAAAAAAAAAAAA'); throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.'); }
      if (!(await passwordMatches(password, user.password_salt, user.password_hash, pepper))) throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.');
      return createSession(request, env, publicUser(user), rememberMe);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = parseCookie(request, SESSION_COOKIE);
      if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      const response = json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
      return appendCookie(response, rememberFlagCookie(request, false, 0));
    }
    if (path === '/api/account/overview' && method === 'GET') {
      const session = await requireSession(request, env);
      await db.prepare(`CREATE TABLE IF NOT EXISTS individual_plan_requests (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, full_name TEXT NOT NULL DEFAULT '',
        goal TEXT NOT NULL, level TEXT NOT NULL, location TEXT NOT NULL, equipment TEXT NOT NULL,
        days_per_week INTEGER NOT NULL, session_minutes INTEGER NOT NULL, training_history TEXT NOT NULL DEFAULT '',
        schedule TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '', avoid TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', admin_note TEXT NOT NULL DEFAULT '',
        consent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`).run();
      const [orders, entitlements, planRequests] = await Promise.all([
        db.prepare('SELECT id, order_number, status, total_amount, currency, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.user_id).all(),
        db.prepare('SELECT id, product_key, product_title, product_type, access_status, created_at FROM user_entitlements WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(session.user_id).all(),
        db.prepare('SELECT id, status, created_at FROM individual_plan_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.user_id).all(),
      ]);
      return json({ orders: orders.results, entitlements: entitlements.results, planRequests: planRequests.results });
    }
    return json({ error: 'Nie znaleziono takiego endpointu API.' }, 404);
  } catch (error) { return safeFailure(error); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Reject oversized API requests before parsing JSON or multipart data.
    if (path.startsWith('/api/')) {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      const maximum = requestBodyLimit(request, path);
      if (contentLength > maximum) {
        return addSecurityHeaders(requestJsonError(413, 'Żądanie jest zbyt duże.'), request);
      }

      // Browser writes must originate from this exact origin. Stripe signs its webhook separately.
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && path !== '/api/stripe/webhook') {
        const origin = request.headers.get('Origin');
        if (!origin || origin !== url.origin) {
          return addSecurityHeaders(requestJsonError(403, 'Odrzucono żądanie spoza zaufanej domeny.'), request);
        }
      }
    }

    const lockedPage = await handleSitePageLock(request, env);
    if (lockedPage) return addSecurityHeaders(lockedPage, request);
    if (!path.startsWith('/api/')) {
      const assetResponse = await env.ASSETS.fetch(request);
      return addSecurityHeaders(assetResponse, request);
    }
    const platformResponse = await handlePlatformApi(request, env);
    const response = platformResponse ?? await handleApi(request, env);
    return addSecurityHeaders(await refreshRollingSessionCookie(request, env, response), request);
  },
};
