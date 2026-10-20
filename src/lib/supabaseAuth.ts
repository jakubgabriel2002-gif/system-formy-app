export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  user?: AuthUser;
};

export type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
};

export type EntitlementRow = {
  id: string;
  product_title: string;
  product_type: string;
  access_status: string;
  created_at: string;
};

export type PlanRequestRow = {
  id: string;
  status: string;
  created_at: string;
};

export type CustomerOverview = {
  orders: OrderRow[];
  entitlements: EntitlementRow[];
  planRequests: PlanRequestRow[];
  errors: string[];
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const SESSION_KEY = 'system-formy.supabase-session.v1';

export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession): AuthSession {
  const expiresAt = session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : undefined);
  const normalized = { ...session, expires_at: expiresAt };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

function makeError(payload: unknown, fallback: string): AuthError {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const message = data.msg ?? data.message ?? data.error_description ?? data.error;
    if (typeof message === 'string' && message.trim()) return new AuthError(message);
  }
  return new AuthError(fallback);
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!isAuthConfigured) {
    throw new AuthError('Logowanie nie jest skonfigurowane. Dodaj VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY w zmiennych środowiskowych kompilacji.');
  }

  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_ANON_KEY);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new AuthError('Nie udało się połączyć z usługą logowania. Sprawdź połączenie i konfigurację Supabase.');
  }

  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok) throw makeError(payload, `Błąd połączenia (${response.status}).`);
  return payload as T;
}

async function refreshSession(session: AuthSession): Promise<AuthSession> {
  if (!session.refresh_token) throw new AuthError('Sesja wygasła. Zaloguj się ponownie.');
  const refreshed = await request<AuthSession>('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  return storeSession(refreshed);
}

export async function getSession(): Promise<AuthSession | null> {
  if (!isAuthConfigured) return null;
  const session = readStoredSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try { return await refreshSession(session); }
    catch { clearStoredSession(); return null; }
  }
  return session;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session?.access_token) return null;
  try {
    const user = await request<AuthUser>('/auth/v1/user', { method: 'GET' }, session.access_token);
    const latest = readStoredSession();
    if (latest) storeSession({ ...latest, user });
    return user;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const session = await request<AuthSession>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
  storeSession(session);
  if (session.user) return session.user;
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Logowanie nie zwróciło danych użytkownika. Spróbuj ponownie.');
  return user;
}

export async function signUp(email: string, password: string): Promise<{ user: AuthUser | null; confirmationRequired: boolean }> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const result = await request<AuthSession & { user?: AuthUser }>('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo },
    }),
  });
  if (result.access_token && result.refresh_token) storeSession(result);
  return { user: result.user ?? null, confirmationRequired: !result.access_token };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  await request<unknown>(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function updatePassword(password: string): Promise<void> {
  const session = await getSession();
  if (!session?.access_token) throw new AuthError('Link odzyskiwania hasła wygasł. Poproś o nowy link.');
  await request<AuthUser>('/auth/v1/user', {
    method: 'PUT',
    body: JSON.stringify({ password }),
  }, session.access_token);
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  try {
    if (session?.access_token && isAuthConfigured) {
      await request<unknown>('/auth/v1/logout', { method: 'POST' }, session.access_token);
    }
  } finally {
    clearStoredSession();
  }
}

export function consumeAuthRedirect(): 'recovery' | 'signup' | null {
  if (!window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new AuthError(errorDescription.replace(/\+/g, ' '));
  }
  if (accessToken && refreshToken) {
    const expiresIn = Number(params.get('expires_in') ?? '3600');
    storeSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get('token_type') ?? 'bearer',
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    });
  }
  if (accessToken || type) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return type === 'recovery' ? 'recovery' : type === 'signup' ? 'signup' : null;
}

async function queryTable<T>(table: string, select: string, order: string): Promise<T[]> {
  const session = await getSession();
  if (!session?.access_token) throw new AuthError('Sesja wygasła. Zaloguj się ponownie.');
  const query = new URLSearchParams({ select, order });
  return request<T[]>(`/rest/v1/${table}?${query.toString()}`, { method: 'GET' }, session.access_token);
}

export async function getCustomerOverview(): Promise<CustomerOverview> {
  const specs = [
    { key: 'orders', table: 'orders', select: 'id,order_number,status,total_amount,currency,created_at', order: 'created_at.desc' },
    { key: 'entitlements', table: 'user_entitlements', select: 'id,product_title,product_type,access_status,created_at', order: 'created_at.desc' },
    { key: 'planRequests', table: 'individual_plan_requests', select: 'id,status,created_at', order: 'created_at.desc' },
  ] as const;

  const result: CustomerOverview = { orders: [], entitlements: [], planRequests: [], errors: [] };
  await Promise.all(specs.map(async (spec) => {
    try {
      const rows = await queryTable<Record<string, unknown>>(spec.table, spec.select, spec.order);
      if (spec.key === 'orders') result.orders = rows as unknown as OrderRow[];
      if (spec.key === 'entitlements') result.entitlements = rows as unknown as EntitlementRow[];
      if (spec.key === 'planRequests') result.planRequests = rows as unknown as PlanRequestRow[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się pobrać danych.';
      result.errors.push(`${spec.table}: ${message}`);
    }
  }));
  return result;
}
