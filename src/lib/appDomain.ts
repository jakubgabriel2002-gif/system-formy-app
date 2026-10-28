import type { ProgressionStrategy } from './trainingProgram';

export type User = { id: string; email: string };
export type AppNotification = { id: string; title: string; message: string; created_at: string; target_user_id?: string | null; target_email?: string | null };
export type ChallengeDay = { day: number; title: string; kind: 'workout' | 'recovery' | 'review'; details: string[] };
export type Challenge = { id: string; challenge_key: string; title: string; description: string; price_amount: number; currency: string; is_free: number; product_key: string | null; duration_days: number; training_plan_json: string; progress_guide_json: string; is_published: number; user_status: string; joined_at: string | null; participants_count: number; completed_days: number; completed_day_numbers: string };
export function parseChallengeDays(raw: string): ChallengeDay[] { try { const value: unknown = JSON.parse(raw || '[]'); return Array.isArray(value) ? value.filter((day): day is ChallengeDay => Boolean(day && typeof day === 'object' && typeof (day as ChallengeDay).day === 'number' && typeof (day as ChallengeDay).title === 'string' && Array.isArray((day as ChallengeDay).details))) : []; } catch { return []; } }
export function parseChallengeGuide(raw: string): string[] { try { const value: unknown = JSON.parse(raw || '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
export type Product = {
  id: string; product_key: string; title: string; description: string; product_type: string;
  price_amount: number; currency: string; is_free: number; is_published?: number;
  checkout_url?: string | null; original_filename?: string | null; cover_key?: string | null; created_at?: string;
  category_slug?: string; target_audience?: string; contents_json?: string; contents?: string[]; discount_percent?: number; discount_starts_at?: string | null; discount_ends_at?: string | null; discount_is_active?: number; is_challenge_product?: number;
};
export type Category = { slug: string; title: string; description?: string };
export type PremiumStatus = { is_premium: boolean; is_trial?: boolean; trial?: { started_at: string; ends_at: string } | null; subscription: { plan_key: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null; plans: { monthly: { price_cents: number; interval: string }; yearly: { price_cents: number; interval: string } }; benefits: { product_discount_percent: number; included_challenge_price_cents: number; individual_plan_regular_cents: number; individual_plan_premium_cents: number } };
export type ExSet = { reps: number; weight_kg: number | null };
export type WorkoutExercise = { name: string; sets_detail: ExSet[]; sets?: number; reps?: number; weight_kg?: number | null };
export type Workout = { id: string; title: string; performed_on: string; notes: string; exercises_json: string; created_at: string };
export type Order = { id: string; order_number: string; display_order_number: string; status: string; total_amount: number; currency: string; created_at: string; email?: string; user_id?: string };
export type OrderItem = { order_id: string; product_key: string; product_title: string; product_type: string; quantity: number; unit_amount: number };
export type Material = { id: string; product_key: string; product_title: string; product_type: string; access_status: string; created_at: string; description?: string; is_published?: number };
export type Day = { day_key: string; title: string; exercises: Array<{ name: string; sets: number; reps: number; weight_kg?: number | null; notes?: string; rest_seconds?: number; transition_rest_seconds?: number; alternatives?: string[] }> };
export type Plan = { id: string; name: string; description: string; days: Day[]; created_at?: string; updated_at?: string; duration_weeks?: number; start_date?: string | null; progression_strategy?: ProgressionStrategy; is_individual_plan?: boolean | number }; 
export type Ticket = { id: string; email: string; topic: string; subject: string; message: string; status: string; admin_note?: string; created_at: string; order_id?: string };
export type IndividualPlanOrder = { id: string; display_order_number?: string | null; user_id: string; email: string; full_name: string; goal: string; level: string; location: string; equipment: string; days_per_week: number; session_minutes: number; training_history: string; schedule: string; preferences: string; avoid: string; notes: string; status: string; admin_note: string; payment_status?: string; order_id?: string | null; checkout_session_id?: string | null; questionnaire_json?: string | null; training_plan_id?: string | null; training_plan_name?: string | null; training_plan_description?: string | null; training_plan_start_date?: string | null; training_plan_progression?: ProgressionStrategy | null; training_plan_json?: string | null; created_at: string; updated_at: string };
export type IndividualPlanUserOrder = { id: string; order_id: string | null; display_order_number: string | null; status: string; payment_status: string; created_at: string; updated_at: string; training_plan_id: string | null; training_plan_name: string | null };
export type IndividualPlanDraft = { name: string; description: string; start_date: string; progression_strategy: ProgressionStrategy; plan_text: string };
export type IndividualPlanEditor = { request_id: string; client_name: string; client_email: string; name: string; description: string; start_date: string; progression_strategy: ProgressionStrategy; location: 'home' | 'gym'; days: Day[] };
const INDIVIDUAL_EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Pełne wyposażenie siłowni', gym: 'Siłownia', none: 'Bez dodatkowego sprzętu', bands: 'Gumy oporowe', dumbbells: 'Hantle', bench: 'Ławka do wyciskania', squat_rack: 'Stojaki / klatka do przysiadów', pullup_bar: 'Drążek do podciągania', kettlebell: 'Kettlebell', suspension: 'Taśmy TRX', barbell: 'Sztanga', weight_plates: 'Obciążenia / talerze', cable_machine: 'Wyciąg górny / dolny', machines: 'Maszyny siłowniane', smith_machine: 'Maszyna Smitha', leg_press: 'Suwnica do nóg', leg_extension_curl: 'Maszyna do nóg', chest_press: 'Maszyna do wyciskania', lat_pulldown: 'Maszyna do ściągania drążka', dip_station: 'Poręcze do dipów', cardio: 'Sprzęt cardio', other: 'Inny sprzęt',
};
export function parseIndividualQuestionnaire(raw?: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, Array.isArray(item) ? item.join(', ') : item == null ? '' : String(item)]));
  } catch { return {}; }
}
export function individualEquipmentLabel(raw: string, other = ''): string {
  let values: string[] = [];
  try { const parsed: unknown = JSON.parse(raw || '[]'); if (Array.isArray(parsed)) values = parsed.filter((item): item is string => typeof item === 'string'); else if (typeof parsed === 'string') values = [parsed]; }
  catch { if (raw) values = [raw]; }
  const labels = values.map(value => INDIVIDUAL_EQUIPMENT_LABELS[value] || value).filter(Boolean);
  if (values.includes('other') && other.trim()) labels.push(`Inny: ${other.trim()}`);
  return labels.length ? labels.join(', ') : '—';
}
export function questionnaireValue(q: Record<string, string>, key: string, fallback = 'Nie podano'): string { const value = (q[key] || '').trim(); return value || fallback; }
export function maximumLabel(q: Record<string, string>, key: string, unknownKey: string, unit: string): string {
  if (q[unknownKey] === 'true') return 'Nie wiem — do sprawdzenia na pierwszym treningu';
  const value = (q[key] || '').trim();
  return value ? `${value} ${unit}` : 'Nie podano';
}
export type Promo = { id: string; code: string; discount_type: string; discount_value: number; starts_at?: string; ends_at?: string; max_uses?: number | null; used_count: number; product_key?: string | null; is_active: number };
export type AdminProduct = Product & { file_key?: string; contents_json?: string; target_audience?: string };
export type Notice = { type: 'success' | 'error' | 'info'; text: string };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const multipart = typeof FormData !== 'undefined' && init.body instanceof FormData;
  headers.set('Accept', 'application/json');
  if (init.body && !multipart && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  let payload: unknown = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : `Wystąpił błąd (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}
export const money = (n: number, currency = 'PLN') => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(Number(n || 0));
export const dateLabel = (value?: string) => { if (!value) return '—'; const date = new Date(value.length === 10 ? `${value}T12:00:00` : value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date); };
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const monday = (from = new Date()) => { const d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const decodeExercises = (value: string): WorkoutExercise[] => { try { const v: unknown = JSON.parse(value); return Array.isArray(v) ? v.map((x) => { const e = x as Record<string, unknown>; const rawSets = Array.isArray(e.sets_detail) ? e.sets_detail as Array<Record<string, unknown>> : []; const fallbackSets = Number(e.sets ?? e.target_sets ?? e.series ?? 1); const fallbackReps = Number(e.reps ?? e.target_reps ?? e.repetitions ?? 1); const fallbackWeight = e.weight_kg ?? e.target_weight_kg ?? null; return { name: String(e.name || e.exercise_name || e.title || ''), sets_detail: rawSets.length ? rawSets.map(item => ({ reps: Number(item.reps ?? item.target_reps ?? item.repetitions ?? 1), weight_kg: (item.weight_kg ?? item.target_weight_kg) == null || (item.weight_kg ?? item.target_weight_kg) === '' ? null : Number(item.weight_kg ?? item.target_weight_kg) })) : Array.from({ length: Number.isInteger(fallbackSets) && fallbackSets > 0 ? Math.min(40, fallbackSets) : 1 }, () => ({ reps: Number.isInteger(fallbackReps) && fallbackReps > 0 ? fallbackReps : 1, weight_kg: fallbackWeight == null || fallbackWeight === '' ? null : Number(fallbackWeight) })) }; }).filter(ex => ex.name.trim().length > 0) : []; } catch { return []; } };
export const productTypeLabel = (v: string) => ({ ebook: 'E-book / PDF', training_plan: 'Plan treningowy', guide: 'Poradnik', bundle: 'Pakiet', other: 'Materiał cyfrowy' } as Record<string, string>)[v] || v;
export const orderStatusLabel = (v: string) => ({ pending: 'Oczekuje', paid: 'Opłacone', processing: 'W realizacji', fulfilled: 'Zrealizowane', canceled: 'Anulowane', refunded: 'Zwrócone' } as Record<string, string>)[v] || v;
export const pathOnly = (v: string) => v.split('?')[0] || '/';
export const individualPlanStatusLabel = (status: string, paymentStatus?: string) => ({
  awaiting_questionnaire: paymentStatus === 'paid' ? 'Zapłacony' : 'Oczekuje na ankietę',
  in_preparation: 'Realizowany', ready: 'Zrealizowany', canceled: 'Anulowane', refunded: 'Zwrócono płatność',
} as Record<string, string>)[status] || status;
export function individualPlanDraftFromRequest(request: IndividualPlanOrder): IndividualPlanDraft {
  let planText = '';
  try {
    const days = JSON.parse(request.training_plan_json || '[]') as Day[];
    if (Array.isArray(days)) planText = days.map(day => {
      const header = `[Dzień ${day.day_key}: ${day.title}]`;
      const exercises = (Array.isArray(day.exercises) ? day.exercises : []).map(ex => [ex.name, ex.sets ?? 3, ex.reps ?? 10, ex.rest_seconds ?? 90, ex.notes || '', ex.weight_kg ?? ''].join('; '));
      return [header, ...exercises].join('\n');
    }).join('\n\n');
  } catch { /* brak wcześniejszego zapisu planu */ }
  if (!planText) planText = '[Dzień A: Trening A]\nPrzysiad; 3; 10; 90; Kontroluj ruch;';
  return {
    name: request.training_plan_name || `Plan indywidualny — ${request.full_name || 'klient'}`.slice(0, 120),
    description: request.training_plan_description || 'Indywidualny plan treningowy przygotowany przez System Formy.',
    start_date: request.training_plan_start_date || today(),
    progression_strategy: request.training_plan_progression || 'reps',
    plan_text: planText,
  };
}
export function parseIndividualPlanText(raw: string): Day[] {
  const lines = raw.split(/\r?\n/);
  const days: Day[] = [];
  let current: Day | null = null;
  const fail = (message: string): never => { throw new Error(message); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      const value = line.slice(1, -1).trim();
      const colon = value.indexOf(':');
      if (colon < 1 || colon === value.length - 1) fail(`Linia ${i + 1}: nagłówek dnia ma format [Dzień A: nazwa treningu].`);
      const rawKey = value.slice(0, colon).trim();
      const dayKey = rawKey.replace(/^dzień\s*/i, '').trim();
      const title = value.slice(colon + 1).trim();
      if (!dayKey || dayKey.length > 30 || title.length > 120) fail(`Linia ${i + 1}: sprawdź nazwę dnia i treningu.`);
      if (days.some(day => day.day_key.toLowerCase() === dayKey.toLowerCase())) fail(`Linia ${i + 1}: oznaczenie dnia „${dayKey}” powtarza się.`);
      current = { day_key: dayKey, title, exercises: [] };
      days.push(current);
      if (days.length > 7) fail('Plan może zawierać maksymalnie 7 dni treningowych.');
      continue;
    }
    // Jawny throw umożliwia TypeScriptowi bezpieczne zawężenie typu po zmianach current w pętli.
    const activeDay = current;
    if (activeDay === null) {
      throw new Error(`Linia ${i + 1}: najpierw dodaj nagłówek dnia, np. [Dzień A: Trening A].`);
    }
    const fields = line.split(';').map(field => field.trim());
    const name = fields[0] || '';
    const sets = fields[1] === undefined || fields[1] === '' ? 3 : Number(fields[1]);
    const reps = fields[2] === undefined || fields[2] === '' ? 10 : Number(fields[2]);
    const rest = fields[3] === undefined || fields[3] === '' ? 90 : Number(fields[3]);
    const notes = fields[4] || '';
    const weight = fields[5] === undefined || fields[5] === '' ? null : Number(fields[5].replace(',', '.'));
    if (!name || name.length > 120 || !Number.isInteger(sets) || sets < 1 || sets > 30 || !Number.isInteger(reps) || reps < 1 || reps > 200 || !Number.isInteger(rest) || rest < 0 || rest > 600 || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))) fail(`Linia ${i + 1}: użyj formatu Nazwa; serie; powtórzenia; przerwa; uwagi; ciężar (kg).`);
    if (fields.length > 6) fail(`Linia ${i + 1}: użyj maksymalnie 6 pól oddzielonych średnikiem.`);
    activeDay.exercises.push({ name, sets, reps, rest_seconds: rest, notes, weight_kg: weight, transition_rest_seconds: 120, alternatives: [] });
    if (activeDay.exercises.length > 40) fail(`Dzień ${activeDay.day_key} ma więcej niż 40 ćwiczeń.`);
  }
  if (!days.length) fail('Dodaj co najmniej jeden dzień treningowy.');
  for (const day of days) if (!day.exercises.length) fail(`Dodaj przynajmniej jedno ćwiczenie do dnia ${day.day_key}.`);
  return days;
}


