interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_PASSWORD_PEPPER?: string;
}

type PublicUser = { id: string; email: string };
type UserRow = PublicUser & { password_hash: string; password_salt: string };
type SessionRow = { id: string; user_id: string; expires_at: number; email: string };
type JsonRecord = Record<string, unknown>;

const SESSION_COOKIE = 'sf_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// Cloudflare Workers WebCrypto caps PBKDF2 iterations at 100,000. Pepper is stored only as a Worker secret.
const PASSWORD_ITERATIONS = 100_000;

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
  const left = new TextEncoder().encode(computed.hash);
  const right = new TextEncoder().encode(expected);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}
function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}
function sessionCookie(request: Request, token: string, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
async function readJson(request: Request): Promise<JsonRecord> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().includes('application/json')) throw new HttpError(415, 'Wysłane dane muszą być w formacie JSON.');
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
    return value as JsonRecord;
  } catch { throw new HttpError(400, 'Nie udało się odczytać danych formularza.'); }
}
function stringField(body: JsonRecord, key: string): string {
  return typeof body[key] === 'string' ? (body[key] as string).trim() : '';
}
function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }
function validEmail(value: string): boolean { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function requireDb(env: Env): D1Database {
  if (!env.DB) throw new HttpError(503, 'Baza D1 nie jest jeszcze podłączona do Workera. Wykonaj instrukcję konfiguracji Cloudflare.');
  return env.DB;
}
function requirePasswordPepper(env: Env): string {
  if (!env.AUTH_PASSWORD_PEPPER || env.AUTH_PASSWORD_PEPPER.length < 32) {
    throw new HttpError(503, 'Logowanie nie jest jeszcze skonfigurowane. Dodaj sekret AUTH_PASSWORD_PEPPER zgodnie z README-CLOUDFLARE.md.');
  }
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
  const now = Date.now();
  const windowStart = now - 15 * 60 * 1000;
  await db.prepare('DELETE FROM auth_rate_limit_events WHERE created_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
  const row = await db.prepare('SELECT COUNT(*) AS total FROM auth_rate_limit_events WHERE scope = ? AND created_at >= ?').bind(scope, windowStart).first<{ total: number }>();
  if ((row?.total ?? 0) >= limit) throw new HttpError(429, 'Wykonano zbyt wiele prób. Odczekaj 15 minut i spróbuj ponownie.');
  await db.prepare('INSERT INTO auth_rate_limit_events (scope, created_at) VALUES (?, ?)').bind(scope, now).run();
}

async function currentSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const db = requireDb(env);
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT s.id, s.user_id, s.expires_at, u.email
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`).bind(tokenHash, Date.now()).first<SessionRow>();
  if (!row) {
    await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return row;
}
async function requireSession(request: Request, env: Env): Promise<SessionRow> {
  const session = await currentSession(request, env);
  if (!session) throw new HttpError(401, 'Sesja wygasła. Zaloguj się ponownie.');
  return session;
}
async function createSession(request: Request, env: Env, user: PublicUser): Promise<Response> {
  const db = requireDb(env);
  const token = randomToken(32);
  const now = Date.now();
  await db.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, await sha256(token), now + SESSION_TTL_MS, new Date(now).toISOString()).run();
  return json({ user }, 200, { 'Set-Cookie': sessionCookie(request, token) });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/health' && method === 'GET') {
    try {
      const db = requireDb(env);
      await db.prepare('SELECT 1 AS ok').first();
      return json({ ok: true, database: 'connected', passwordAuthConfigured: Boolean(env.AUTH_PASSWORD_PEPPER && env.AUTH_PASSWORD_PEPPER.length >= 32), passwordRecovery: 'manual-email' });
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

    if (path === '/api/auth/register' && method === 'POST') {
      await applyRateLimit(request, db, 'register', 8);
      const body = await readJson(request);
      const email = normalizedEmail(stringField(body, 'email'));
      const password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email)) throw new HttpError(400, 'Podaj prawidłowy adres e-mail.');
      if (password.length < 10 || password.length > 128) throw new HttpError(400, 'Hasło musi mieć od 10 do 128 znaków.');
      const existing = await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first<{ id: string }>();
      if (existing) throw new HttpError(409, 'Konto z tym adresem e-mail już istnieje. Zaloguj się lub odzyskaj hasło.');
      const { salt, hash } = await makePasswordHash(password, requirePasswordPepper(env));
      const user = { id: crypto.randomUUID(), email };
      const now = new Date().toISOString();
      await db.prepare('INSERT INTO users (id, email, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, email, hash, salt, now, now).run();
      return createSession(request, env, user);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      await applyRateLimit(request, db, 'login', 12);
      const body = await readJson(request);
      const email = normalizedEmail(stringField(body, 'email'));
      const password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email) || !password || password.length > 128) throw new HttpError(400, 'Podaj prawidłowy e-mail i hasło.');
      const pepper = requirePasswordPepper(env);
      const user = await db.prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ? LIMIT 1').bind(email).first<UserRow>();
      // Do comparable password-hash work for unknown emails to reduce account-enumeration timing differences.
      if (!user) {
        await makePasswordHash(password, pepper, 'AAAAAAAAAAAAAAAAAAAAAA');
        throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.');
      }
      const matches = await passwordMatches(password, user.password_salt, user.password_hash, pepper);
      if (!matches) throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.');
      return createSession(request, env, publicUser(user));
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = parseCookie(request, SESSION_COOKIE);
      if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
    }

    if (path === '/api/account/overview' && method === 'GET') {
      const session = await requireSession(request, env);
      const [orders, entitlements, planRequests] = await Promise.all([
        db.prepare('SELECT id, order_number, status, total_amount, currency, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.user_id).all(),
        db.prepare('SELECT id, product_title, product_type, access_status, created_at FROM user_entitlements WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(session.user_id).all(),
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
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
