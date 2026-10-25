import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import TrainingRoute from './components/training/TrainingRoute';
import PlanBuilder from './components/PlanBuilder';
import PlanGenerator, { type GeneratedPlanDraft } from './components/PlanGenerator';
import IndividualPlanRequest from './components/IndividualPlanRequest';
import { replaceExercisesFromCatalog } from './lib/exerciseCatalog';
import { getProgramEndDate, PROGRAM_WEEKS, type ProgressionStrategy } from './lib/trainingProgram';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardList, Clock3, Crown, Dumbbell, FileText, Gauge, Goal,
  Home, KeyRound, LayoutDashboard, LifeBuoy, List, LockKeyhole, LogOut, Mail, Menu,
  Minus, Plus, Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles,
  Timer, TrendingUp, Trash2, UserRound, Users, WalletCards, X,
} from 'lucide-react';

type User = { id: string; email: string };
type Product = {
  id: string; product_key: string; title: string; description: string; product_type: string;
  price_amount: number; currency: string; is_free: number; is_published?: number;
  checkout_url?: string | null; original_filename?: string | null; cover_key?: string | null; created_at?: string;
  category_slug?: string; target_audience?: string; contents_json?: string; contents?: string[]; discount_percent?: number; discount_starts_at?: string | null; discount_ends_at?: string | null; discount_is_active?: number;
};
type Category = { slug: string; title: string; description?: string };
type ExSet = { reps: number; weight_kg: number | null };
type WorkoutExercise = { name: string; sets_detail: ExSet[]; sets?: number; reps?: number; weight_kg?: number | null };
type Workout = { id: string; title: string; performed_on: string; notes: string; exercises_json: string; created_at: string };
type Order = { id: string; order_number: string; display_order_number: string; status: string; total_amount: number; currency: string; created_at: string; email?: string; user_id?: string };
type OrderItem = { order_id: string; product_key: string; product_title: string; product_type: string; quantity: number; unit_amount: number };
type Material = { id: string; product_key: string; product_title: string; product_type: string; access_status: string; created_at: string; description?: string; is_published?: number };
type Day = { day_key: string; title: string; exercises: Array<{ name: string; sets: number; reps: number; weight_kg?: number | null; notes?: string; rest_seconds?: number; transition_rest_seconds?: number; alternatives?: string[] }> };
type Plan = { id: string; name: string; description: string; days: Day[]; created_at?: string; updated_at?: string; duration_weeks?: number; start_date?: string | null; progression_strategy?: ProgressionStrategy; is_individual_plan?: boolean | number }; 
type Ticket = { id: string; email: string; topic: string; subject: string; message: string; status: string; admin_note?: string; created_at: string; order_id?: string };
type IndividualPlanOrder = { id: string; display_order_number?: string | null; user_id: string; email: string; full_name: string; goal: string; level: string; location: string; equipment: string; days_per_week: number; session_minutes: number; training_history: string; schedule: string; preferences: string; avoid: string; notes: string; status: string; admin_note: string; payment_status?: string; order_id?: string | null; checkout_session_id?: string | null; questionnaire_json?: string | null; training_plan_id?: string | null; training_plan_name?: string | null; training_plan_description?: string | null; training_plan_start_date?: string | null; training_plan_progression?: ProgressionStrategy | null; training_plan_json?: string | null; created_at: string; updated_at: string };
type IndividualPlanUserOrder = { id: string; order_id: string | null; display_order_number: string | null; status: string; payment_status: string; created_at: string; updated_at: string; training_plan_id: string | null; training_plan_name: string | null };
type IndividualPlanDraft = { name: string; description: string; start_date: string; progression_strategy: ProgressionStrategy; plan_text: string };
const INDIVIDUAL_EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Pełne wyposażenie siłowni', gym: 'Siłownia', none: 'Bez dodatkowego sprzętu', bands: 'Gumy oporowe', dumbbells: 'Hantle', bench: 'Ławka do wyciskania', squat_rack: 'Stojaki / klatka do przysiadów', pullup_bar: 'Drążek do podciągania', kettlebell: 'Kettlebell', suspension: 'Taśmy TRX', barbell: 'Sztanga', weight_plates: 'Obciążenia / talerze', cable_machine: 'Wyciąg górny / dolny', machines: 'Maszyny siłowniane', smith_machine: 'Maszyna Smitha', leg_press: 'Suwnica do nóg', leg_extension_curl: 'Maszyna do nóg', chest_press: 'Maszyna do wyciskania', lat_pulldown: 'Maszyna do ściągania drążka', dip_station: 'Poręcze do dipów', cardio: 'Sprzęt cardio', other: 'Inny sprzęt',
};
function parseIndividualQuestionnaire(raw?: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, Array.isArray(item) ? item.join(', ') : item == null ? '' : String(item)]));
  } catch { return {}; }
}
function individualEquipmentLabel(raw: string, other = ''): string {
  let values: string[] = [];
  try { const parsed: unknown = JSON.parse(raw || '[]'); if (Array.isArray(parsed)) values = parsed.filter((item): item is string => typeof item === 'string'); else if (typeof parsed === 'string') values = [parsed]; }
  catch { if (raw) values = [raw]; }
  const labels = values.map(value => INDIVIDUAL_EQUIPMENT_LABELS[value] || value).filter(Boolean);
  if (values.includes('other') && other.trim()) labels.push(`Inny: ${other.trim()}`);
  return labels.length ? labels.join(', ') : '—';
}
function questionnaireValue(q: Record<string, string>, key: string, fallback = 'Nie podano'): string { const value = (q[key] || '').trim(); return value || fallback; }
function maximumLabel(q: Record<string, string>, key: string, unknownKey: string, unit: string): string {
  if (q[unknownKey] === 'true') return 'Nie wiem — do sprawdzenia na pierwszym treningu';
  const value = (q[key] || '').trim();
  return value ? `${value} ${unit}` : 'Nie podano';
}
type Promo = { id: string; code: string; discount_type: string; discount_value: number; starts_at?: string; ends_at?: string; max_uses?: number | null; used_count: number; product_key?: string | null; is_active: number };
type AdminProduct = Product & { file_key?: string; contents_json?: string; target_audience?: string };
type Notice = { type: 'success' | 'error' | 'info'; text: string };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
const money = (n: number, currency = 'PLN') => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(Number(n || 0));
const dateLabel = (value?: string) => { if (!value) return '—'; const date = new Date(value.length === 10 ? `${value}T12:00:00` : value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monday = (from = new Date()) => { const d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const decodeExercises = (value: string): WorkoutExercise[] => { try { const v: unknown = JSON.parse(value); return Array.isArray(v) ? v.map((x) => { const e = x as Record<string, unknown>; const rawSets = Array.isArray(e.sets_detail) ? e.sets_detail as Array<Record<string, unknown>> : []; const fallbackSets = Number(e.sets ?? e.target_sets ?? e.series ?? 1); const fallbackReps = Number(e.reps ?? e.target_reps ?? e.repetitions ?? 1); const fallbackWeight = e.weight_kg ?? e.target_weight_kg ?? null; return { name: String(e.name || e.exercise_name || e.title || ''), sets_detail: rawSets.length ? rawSets.map(item => ({ reps: Number(item.reps ?? item.target_reps ?? item.repetitions ?? 1), weight_kg: (item.weight_kg ?? item.target_weight_kg) == null || (item.weight_kg ?? item.target_weight_kg) === '' ? null : Number(item.weight_kg ?? item.target_weight_kg) })) : Array.from({ length: Number.isInteger(fallbackSets) && fallbackSets > 0 ? Math.min(40, fallbackSets) : 1 }, () => ({ reps: Number.isInteger(fallbackReps) && fallbackReps > 0 ? fallbackReps : 1, weight_kg: fallbackWeight == null || fallbackWeight === '' ? null : Number(fallbackWeight) })) }; }).filter(ex => ex.name.trim().length > 0) : []; } catch { return []; } };
const productTypeLabel = (v: string) => ({ ebook: 'E-book / PDF', training_plan: 'Plan treningowy', guide: 'Poradnik', bundle: 'Pakiet', other: 'Materiał cyfrowy' } as Record<string, string>)[v] || v;
const orderStatusLabel = (v: string) => ({ pending: 'Oczekuje', paid: 'Opłacone', processing: 'W realizacji', fulfilled: 'Zrealizowane', canceled: 'Anulowane', refunded: 'Zwrócone' } as Record<string, string>)[v] || v;
const pathOnly = (v: string) => v.split('?')[0] || '/';
const individualPlanStatusLabel = (status: string, paymentStatus?: string) => ({
  awaiting_questionnaire: paymentStatus === 'paid' ? 'Zapłacony' : 'Oczekuje na ankietę',
  in_preparation: 'Realizowany', ready: 'Zrealizowany', canceled: 'Anulowane', refunded: 'Zwrócono płatność',
} as Record<string, string>)[status] || status;
function individualPlanDraftFromRequest(request: IndividualPlanOrder): IndividualPlanDraft {
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
function parseIndividualPlanText(raw: string): Day[] {
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


const SAMPLE_PLANS: Record<'home' | 'gym', { name: string; description: string; days: Day[] }> = {
  home: {
    name: 'Plan przykładowy — dom bez sprzętu',
    description: 'Trzy treningi całego ciała w tygodniu. Bez hantli, maszyn i innego sprzętu; dobierz wariant ćwiczenia do swoich możliwości.',
    days: [
      { day_key: 'A', title: 'Dzień A — całe ciało', exercises: [{ name: 'Pompki (wariant dostosowany)', sets: 3, reps: 8 }, { name: 'Przysiady bez obciążenia', sets: 3, reps: 12 }, { name: 'Most biodrowy', sets: 3, reps: 12 }, { name: 'Plank (30 s na serię)', sets: 3, reps: 30, notes: 'W polu wyniku wpisz czas utrzymania pozycji w sekundach.' }] },
      { day_key: 'B', title: 'Dzień B — nogi i brzuch', exercises: [{ name: 'Wykroki w miejscu (na stronę)', sets: 3, reps: 8 }, { name: 'Most biodrowy', sets: 3, reps: 15 }, { name: 'Wspięcia na palce', sets: 3, reps: 15 }, { name: 'Dead bug (na stronę)', sets: 3, reps: 8 }] },
      { day_key: 'C', title: 'Dzień C — całe ciało', exercises: [{ name: 'Pompki (wariant dostosowany)', sets: 3, reps: 8 }, { name: 'Przysiady bez obciążenia', sets: 3, reps: 15 }, { name: 'Wykroki w miejscu (na stronę)', sets: 3, reps: 8 }, { name: 'Plank (30 s na serię)', sets: 3, reps: 30 }] },
    ],
  },
  gym: {
    name: 'Plan przykładowy — siłownia',
    description: 'Trzy treningi całego ciała dla początkujących. Ciężar dobierz samodzielnie; plan nie narzuca kilogramów.',
    days: [
      { day_key: 'A', title: 'Dzień A — całe ciało', exercises: [{ name: 'Przysiad goblet lub na suwnicy', sets: 3, reps: 10 }, { name: 'Wyciskanie na ławce', sets: 3, reps: 8 }, { name: 'Ściąganie drążka wyciągu', sets: 3, reps: 10 }, { name: 'Martwy ciąg rumuński z hantlami', sets: 3, reps: 10 }, { name: 'Plank (30 s na serię)', sets: 3, reps: 30 }] },
      { day_key: 'B', title: 'Dzień B — całe ciało', exercises: [{ name: 'Wypychanie na suwnicy', sets: 3, reps: 10 }, { name: 'Wiosłowanie na wyciągu', sets: 3, reps: 10 }, { name: 'Wyciskanie hantli nad głowę', sets: 3, reps: 10 }, { name: 'Uginanie nóg na maszynie', sets: 3, reps: 12 }, { name: 'Brzuszki kontrolowane', sets: 3, reps: 12 }] },
      { day_key: 'C', title: 'Dzień C — całe ciało', exercises: [{ name: 'Przysiad na suwnicy lub z hantlem', sets: 3, reps: 10 }, { name: 'Wyciskanie hantli na skosie', sets: 3, reps: 10 }, { name: 'Wiosłowanie z podparciem', sets: 3, reps: 10 }, { name: 'Hip thrust', sets: 3, reps: 10 }, { name: 'Face pull', sets: 3, reps: 12 }] },
    ],
  },
};

export default function AppV2() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search);
  const path = pathOnly(route);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [adminReady, setAdminReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [individualPlanPaymentConfirmed, setIndividualPlanPaymentConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [consent, setConsent] = useState(() => { try { return localStorage.getItem('sf-v2-analytics-consent') || ''; } catch { return ''; } });
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [profile, setProfile] = useState({ first_name: '', primary_goal: '', training_location: '', weight_kg: null as number | null, height_cm: null as number | null, training_days_per_week: null as number | null });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [adminOrderItems, setAdminOrderItems] = useState<OrderItem[]>([]);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  const [newPlanDayCount, setNewPlanDayCount] = useState(3);
  const [newPlanLocation, setNewPlanLocation] = useState<'home' | 'gym'>('gym');
  const [newPlanStartDate, setNewPlanStartDate] = useState(today());
  const [newPlanProgression, setNewPlanProgression] = useState<ProgressionStrategy>('reps');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [storeNotice, setStoreNotice] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainingPlanLimit, setTrainingPlanLimit] = useState(1);
  const [trainingIsPremium, setTrainingIsPremium] = useState(false);
  const [legacyPlans, setLegacyPlans] = useState<Array<{ day_key: string; title: string; exercises_json: string }>>([]);
  const [progress, setProgress] = useState<{ session_count: number; weekly: Record<string, number>; records: Record<string, { weight: number; reps: number; date: string }>; goal: { goal_title: string; target_date?: string; target_value?: number; current_value?: number; unit?: string; notes?: string } | null; measurements: Array<Record<string, unknown>> }>({ session_count: 0, weekly: {}, records: {}, goal: null, measurements: [] });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planStartDate, setPlanStartDate] = useState(today());
  const [planProgression, setPlanProgression] = useState<ProgressionStrategy>('reps');
  const [planDays, setPlanDays] = useState<Day[]>([{ day_key: 'A', title: 'Dzień A', exercises: [{ name: 'Przysiad', sets: 3, reps: 10, rest_seconds: 90, transition_rest_seconds: 120 }] }]);
  const [activePlanId, setActivePlanId] = useState('');
  const [workoutPlanChoice, setWorkoutPlanChoice] = useState('');
  const [workoutDayChoice, setWorkoutDayChoice] = useState('');
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');
  const [goalTargetValue, setGoalTargetValue] = useState('');
  const [goalCurrentValue, setGoalCurrentValue] = useState('');
  const [goalUnit, setGoalUnit] = useState('');
  const [measurementDate, setMeasurementDate] = useState(today());
  const [measurementWeight, setMeasurementWeight] = useState('');
  const [measurementWaist, setMeasurementWaist] = useState('');
  const [measurementFat, setMeasurementFat] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'recovery'>(() => window.location.pathname === '/rejestracja' ? 'signup' : 'login');
  const [productCode, setProductCode] = useState('');
  const [ticketTopic, setTicketTopic] = useState('access');
  const [ticketOrderId, setTicketOrderId] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [adminProducts, setAdminProducts] = useState<AdminProduct[]>([]);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminUsers, setAdminUsers] = useState<Array<Record<string, unknown>>>([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState<{ user: Record<string, unknown>; profile: Record<string, unknown> | null; orders: Order[]; entitlements: Material[]; recent_workouts: Array<Record<string, unknown>>; tickets: Array<Record<string, unknown>>; items: OrderItem[] } | null>(null);
  const [payments, setPayments] = useState<{ events: Array<Record<string, unknown>>; attention_orders: Order[] }>({ events: [], attention_orders: [] });
  const [promos, setPromos] = useState<Promo[]>([]);
  const [adminTickets, setAdminTickets] = useState<Ticket[]>([]);
  const [individualPlanOrders, setIndividualPlanOrders] = useState<IndividualPlanOrder[]>([]);
  const [individualPlanDrafts, setIndividualPlanDrafts] = useState<Record<string, IndividualPlanDraft>>({});
  const [individualPlanUserOrders, setIndividualPlanUserOrders] = useState<IndividualPlanUserOrder[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown>>({});
  const [adminSummary, setAdminSummary] = useState<Record<string, unknown>>({});
  const [adminSearch, setAdminSearch] = useState('');
  const [adminOrderStatus, setAdminOrderStatus] = useState('');
  const [adminOrderFrom, setAdminOrderFrom] = useState('');
  const [adminOrderTo, setAdminOrderTo] = useState('');
  const [categoryForm, setCategoryForm] = useState({ slug: '', title: '', description: '' });
  const [promoForm, setPromoForm] = useState({ code: '', discount_type: 'percent', discount_value: '10', starts_at: '', ends_at: '', max_uses: '', product_key: '' });
  const [productForm, setProductForm] = useState({ title: '', product_key: '', description: '', product_type: 'ebook', price_amount: '0', is_free: true, is_published: true, category_slug: 'ebooki', target_audience: '', contents: '', components: '' });
  const [bundleComponents, setBundleComponents] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState({ support_email: '', store_notice: '', analytics_enabled: 'true', site_lock_enabled: 'false', site_lock_password: '', maintenance_message: 'Witryna jest tymczasowo w trybie konserwacji. Wróć za chwilę.', maintenance_until: '' });
  const [liveUsers, setLiveUsers] = useState<{active_visitors:number;active_users:number;visitors:Array<{email:string|null;path:string;last_seen:string;authenticated:boolean}>}>({active_visitors:0,active_users:0,visitors:[]});
  const [adminAudit, setAdminAudit] = useState<Array<{id:string;actor_email:string;action:string;entity_type:string;entity_id:string;details_json:string;created_at:string}>>([]);

  const notify = useCallback((text: string, type: Notice['type'] = 'info') => { setNotice({ text, type }); window.setTimeout(() => setNotice((old) => old?.text === text ? null : old), 6000); }, []);
  const go = useCallback((next: string, replace = false) => { if (replace) window.history.replaceState({}, '', next); else window.history.pushState({}, '', next); setRoute(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  const track = useCallback((event_type: string, product_key = '') => {
    if (consent !== 'yes') return;
    try {
      let sessionKey = sessionStorage.getItem('sf-v2-analytics-session');
      if (!sessionKey) { sessionKey = crypto.randomUUID(); sessionStorage.setItem('sf-v2-analytics-session', sessionKey); }
      void api('/api/v2/analytics', { method: 'POST', body: JSON.stringify({ event_type, product_key, path: window.location.pathname, session_key: sessionKey }) }).catch(() => {});
    } catch { /* Analityka jest opcjonalna; jej błąd nie może blokować aplikacji. */ }
  }, [consent]);

  const loadCatalog = useCallback(async () => {
    try { const result = await api<{ products: Product[]; categories: Category[] }>('/api/v2/products'); setProducts(result.products || []); setCategories(result.categories || []); }
    catch { const result = await api<{ products: Product[] }>('/api/products').catch(() => ({ products: [] })); setProducts(result.products || []); }
    const settings = await api<{ store_notice?: string; support_email?: string }>('/api/v2/settings/public').catch(() => ({ store_notice: '', support_email: '' }));
    setStoreNotice(settings.store_notice || ''); setSupportEmail(settings.support_email || '');
  }, []);
  const refreshUserData = useCallback(async () => {
    if (!user) return;
    setAdminReady(false);
    setLoading(true);
    const [p, o, m, w, pl, pr, t] = await Promise.allSettled([
      api<{ profile: typeof profile }>('/api/account/profile'), api<{ orders: Order[]; items?: OrderItem[]; individual_plans?: IndividualPlanUserOrder[] }>('/api/v2/account/orders'),
      api<{ materials: Material[] }>('/api/v2/account/materials'), api<{ sessions: Workout[] }>('/api/v2/training/sessions'),
      api<{ plans: Plan[]; legacy: typeof legacyPlans; plan_limit?: number; is_premium?: boolean; plans_used?: number }>('/api/v2/training/plans'), api<typeof progress>('/api/v2/progress'),
      api<{ tickets: Ticket[] }>('/api/v2/help/tickets'),
    ]);
    if (p.status === 'fulfilled') setProfile({ first_name: p.value.profile?.first_name || '', primary_goal: p.value.profile?.primary_goal || '', training_location: p.value.profile?.training_location || '', weight_kg: p.value.profile?.weight_kg ?? null, height_cm: p.value.profile?.height_cm ?? null, training_days_per_week: p.value.profile?.training_days_per_week ?? null });
    if (o.status === 'fulfilled') { setOrders(o.value.orders || []); setOrderItems(o.value.items || []); setIndividualPlanUserOrders(o.value.individual_plans || []); }
    if (m.status === 'fulfilled') setMaterials(m.value.materials || []);
    if (w.status === 'fulfilled') setSessions(w.value.sessions || []);
    if (pl.status === 'fulfilled') { const nextPlans = pl.value.plans || []; setPlans(nextPlans); setLegacyPlans(pl.value.legacy || []); setTrainingIsPremium(Boolean(pl.value.is_premium)); setTrainingPlanLimit(Number(pl.value.plan_limit) || (pl.value.is_premium ? 3 : 1)); setWorkoutPlanChoice(old => nextPlans.some(plan => plan.id === old) ? old : nextPlans[0]?.id || ''); setWorkoutDayChoice(old => { const candidate = nextPlans.find(plan => plan.id === workoutPlanChoice) || nextPlans[0]; return candidate?.days.some(day => day.day_key === old) ? old : candidate?.days[0]?.day_key || ''; }); }
    if (pr.status === 'fulfilled') { setProgress(pr.value); setGoalTitle(pr.value.goal?.goal_title || ''); setGoalTargetDate(pr.value.goal?.target_date || ''); setGoalTargetValue(pr.value.goal?.target_value == null ? '' : String(pr.value.goal.target_value)); setGoalCurrentValue(pr.value.goal?.current_value == null ? '' : String(pr.value.goal.current_value)); setGoalUnit(pr.value.goal?.unit || ''); setGoalEditing(!pr.value.goal); }
    if (t.status === 'fulfilled') setTickets(t.value.tickets || []);
    const me = await api<{ isAdmin: boolean }>('/api/admin/me').catch(() => ({ isAdmin: false })); setAdmin(Boolean(me.isAdmin)); setAdminReady(true); setLoading(false);
  }, [user, workoutPlanChoice]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    api<{ user: User | null }>('/api/auth/me').then((r) => {
      // Do not keep the previous logged-out adminReady=true state while loading an existing session.
      if (r.user) setAdminReady(false);
      else { setAdmin(false); setAdminReady(true); }
      setUser(r.user);
    }).catch(() => { setAdmin(false); setAdminReady(true); setUser(null); }).finally(() => setAuthReady(true));
    void loadCatalog();
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('payment') === 'cancelled') notify('Zakup został anulowany. Nie pobrano płatności.', 'info');
    if (searchParams.get('payment') === 'success') notify('Płatność wróciła ze Stripe. Czekam na potwierdzenie i dostęp do materiału.', 'info');
    return () => window.removeEventListener('popstate', onPop);
  }, [loadCatalog, notify]);

  useEffect(() => { setIndividualPlanUserOrders([]); if (user) void refreshUserData(); else { setAdmin(false); setAdminReady(true); setOrders([]); setOrderItems([]); setMaterials([]); setSessions([]); setPlans([]); setTrainingPlanLimit(1); setTrainingIsPremium(false); setTickets([]); } }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    if (path === '/app/zamowienia') {
      void api<{ orders: Order[]; items?: OrderItem[]; individual_plans?: IndividualPlanUserOrder[] }>('/api/v2/account/orders').then(result => {
        setOrders(result.orders || []); setOrderItems(result.items || []); setIndividualPlanUserOrders(result.individual_plans || []);
      }).catch(() => {});
    }
    if (path === '/app/plan' || path.startsWith('/app/plan/')) {
      void api<{ plans: Plan[]; legacy: typeof legacyPlans; plan_limit?: number; is_premium?: boolean }>('/api/v2/training/plans').then(result => {
        const nextPlans = result.plans || [];
        setPlans(nextPlans); setLegacyPlans(result.legacy || []); setTrainingIsPremium(Boolean(result.is_premium)); setTrainingPlanLimit(Number(result.plan_limit) || (result.is_premium ? 3 : 1));
        setWorkoutPlanChoice(old => nextPlans.some(plan => plan.id === old) ? old : nextPlans[0]?.id || '');
        setWorkoutDayChoice(old => { const candidate = nextPlans.find(plan => plan.id === workoutPlanChoice) || nextPlans[0]; return candidate?.days.some(day => day.day_key === old) ? old : candidate?.days[0]?.day_key || ''; });
      }).catch(() => {});
    }
  }, [path, user?.id]);
  useEffect(() => {
    const params = new URLSearchParams(route.split('?')[1] || '');
    const payment = params.get('payment');
    const sessionId = params.get('session_id');
    if (!user || payment !== 'success' || !sessionId) return;
    let stopped = false;
    let timer: number | undefined;
    let attempts = 0;
    // Usuń identyfikator Checkout z paska adresu, ale zachowaj polling webhooka.
    window.history.replaceState({}, '', pathOnly(route) === '/app/plan/katalog' ? '/app/plan/katalog' : '/app/zamowienia');
    const check = async () => {
      try {
        const result = await api<{ orders: Order[]; items: OrderItem[]; individual_plans?: IndividualPlanUserOrder[] }>('/api/v2/account/orders');
        if (stopped) return;
        const confirmedOrder = (result.orders || []).find(order => order.order_number === `STRIPE-${sessionId}` && ['paid', 'processing', 'fulfilled'].includes(order.status));
        if (confirmedOrder) {
          setOrders(result.orders || []); setOrderItems(result.items || []); setIndividualPlanUserOrders(result.individual_plans || []);
          const itemForOrder = (result.items || []).find(item => item.order_id === confirmedOrder.id);
          if (itemForOrder?.product_key === 'plan-indywidualny') {
            setIndividualPlanPaymentConfirmed(true);
            try { sessionStorage.removeItem('sf-individual-plan-form-v1'); sessionStorage.removeItem('sf-individual-plan-request-id'); } catch { /* optional storage */ }
          }
          await refreshUserData();
          if (!stopped) notify(itemForOrder?.product_key === 'plan-indywidualny' ? 'Płatność za plan indywidualny została potwierdzona. Zamówienie jest zapisane i widoczne w ACP.' : 'Płatność została potwierdzona przez Stripe. Zamówienie i dostęp są zapisane.', 'success');
          return;
        }
      } catch { /* Webhook może nie być jeszcze przetworzony; spróbuj ponownie. */ }
      attempts += 1;
      if (attempts >= 8) { if (!stopped) notify('Płatność nadal oczekuje na potwierdzenie. Nie ponawiaj zakupu — odśwież zamówienia za chwilę albo zgłoś problem.', 'info'); return; }
      timer = window.setTimeout(() => { void check(); }, 2000);
    };
    void check();
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [user?.id, route, refreshUserData, notify]);
  useEffect(() => {
    if (!authReady) return;
    const privatePath = path === '/app' || path.startsWith('/app/');
    if (privatePath && !user && path !== '/login' && path !== '/rejestracja') go(`/login?next=${encodeURIComponent(route)}`, true);
    if (path.startsWith('/acp') && user && adminReady && !admin) {
      void api<{ enabled: boolean; unlocked: boolean }>('/api/v2/site-lock/status')
        .then(lock => {
          if (lock.enabled && !lock.unlocked) window.location.replace('/maintenance');
          else { notify('Ten panel jest dostępny wyłącznie dla administratora.', 'error'); go('/app', true); }
        })
        .catch(() => { notify('Ten panel jest dostępny wyłącznie dla administratora.', 'error'); go('/app', true); });
    }
    if (path.startsWith('/acp') && !user && path !== '/login') go(`/login?next=${encodeURIComponent(route)}`, true);
  }, [authReady, user?.id, path, admin, adminReady, route, go, notify]);

  // Weryfikuj ważność sesji podczas aktywnego korzystania z aplikacji.
  // Ostateczne uprawnienia nadal sprawdza Worker przy każdym żądaniu.
  useEffect(() => {
    if (!user) return;
    let lastPing = Date.now();
    let checking = false;
    const onActivity = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastPing < 60_000 || checking) return;
      lastPing = now;
      checking = true;
      void api<{ user: User | null }>('/api/auth/me')
        .then((result) => {
          if (result.user) return;
          setUser(null);
          setAdmin(false);
          if (path.startsWith('/app') || path.startsWith('/acp')) go(`/login?next=${encodeURIComponent(route)}`, true);
          notify('Sesja wygasła. Zaloguj się ponownie.', 'info');
        })
        .catch(() => { /* chwilowy błąd sieci nie powinien wylogowywać użytkownika */ })
        .finally(() => { checking = false; });
    };
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('scroll', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [user?.id, path, route, go, notify]);

  useEffect(() => { track(path.startsWith('/produkty/') ? 'product_view' : 'page_view', path.startsWith('/produkty/') ? decodeURIComponent(path.split('/')[2] || '') : ''); }, [path, track]);

  // Presence is deliberately ephemeral and independent from optional marketing analytics consent.
  useEffect(() => {
    let sessionKey = '';
    try { sessionKey = sessionStorage.getItem('sf-live-presence-session') || ''; if (!sessionKey) { sessionKey = crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('sf-live-presence-session', sessionKey); } } catch { sessionKey = crypto.randomUUID().replace(/-/g, ''); }
    const ping = () => { void api('/api/v2/presence/heartbeat', { method: 'POST', body: JSON.stringify({ session_key: sessionKey, path: window.location.pathname }) }).catch(() => {}); };
    ping(); const timer = window.setInterval(ping, 30000);
    return () => window.clearInterval(timer);
  }, [path, user?.id]);
  useEffect(() => {
    if (!path.startsWith('/acp') || !admin) return;
    const load = async () => {
      if (path === '/acp' || path === '/acp/') {
        setAdminSummary(await api<Record<string, unknown>>('/api/v2/admin/overview').catch(() => ({})));
        const loadLive = async () => setLiveUsers(await api<typeof liveUsers>('/api/v2/admin/live-users').catch(() => ({ active_visitors: 0, active_users: 0, visitors: [] })));
        await loadLive();
        const audit = await api<{entries:typeof adminAudit}>('/api/v2/admin/audit-log').catch(() => ({entries:[]})); setAdminAudit(audit.entries || []);
      }
      if (path.startsWith('/acp/produkty')) { const r = await api<{ products: AdminProduct[]; categories: Category[]; components: Array<{ bundle_key: string; component_product_key: string }> }>('/api/v2/admin/products').catch((): { products: AdminProduct[]; categories: Category[]; components: Array<{ bundle_key: string; component_product_key: string }> } => ({ products: [], categories: [], components: [] })); setAdminProducts(r.products || []); setCategories(r.categories || []); const map: Record<string, string> = {}; for (const c of r.components) map[c.bundle_key] = r.components.filter(x => x.bundle_key === c.bundle_key).map(x => x.component_product_key).join(', '); setBundleComponents(map); }
      if (path.startsWith('/acp/zamowienia')) { const r = await api<{ orders: Order[]; items?: OrderItem[] }>('/api/v2/admin/orders').catch(() => ({ orders: [], items: [] })); setAdminOrders(r.orders || []); setAdminOrderItems(r.items || []); }
      if (path.startsWith('/acp/uzytkownicy')) { const [r, productsResult] = await Promise.all([api<{ users: Array<Record<string, unknown>> }>('/api/v2/admin/users').catch(() => ({ users: [] })), api<{ products: AdminProduct[] }>('/api/v2/admin/products').catch(() => ({ products: [] }))]); setAdminUsers(r.users || []); setAdminProducts(productsResult.products || []); }
      if (path.startsWith('/acp/platnosci')) setPayments(await api<typeof payments>('/api/v2/admin/payments').catch(() => ({ events: [], attention_orders: [] })));
      if (path.startsWith('/acp/promocje')) { const r = await api<{ promotions: Promo[] }>('/api/v2/admin/promotions').catch(() => ({ promotions: [] })); setPromos(r.promotions || []); }
      if (path.startsWith('/acp/pomoc')) { const r = await api<{ tickets: Ticket[] }>('/api/v2/admin/support').catch(() => ({ tickets: [] })); setAdminTickets(r.tickets || []); }
      if (path.startsWith('/acp/plany-indywidualne')) { const r = await api<{ requests: IndividualPlanOrder[] }>('/api/v2/admin/individual-plan-requests').catch(() => ({ requests: [] })); const requests = r.requests || []; setIndividualPlanOrders(requests); setIndividualPlanDrafts(Object.fromEntries(requests.map(request => [request.id, individualPlanDraftFromRequest(request)]))); }
      if (path.startsWith('/acp/statystyki')) setAnalytics(await api<Record<string, unknown>>('/api/v2/admin/analytics').catch(() => ({})));
      if (path.startsWith('/acp/ustawienia')) { const r = await api<{ settings: Array<{ setting_key: string; setting_value: string }> }>('/api/v2/admin/settings').catch(() => ({ settings: [] })); setSettings((old) => { const next = { ...old }; for (const item of r.settings) if (item.setting_key in next) (next as Record<string, string>)[item.setting_key] = item.setting_key === 'maintenance_until' && item.setting_value ? item.setting_value.slice(0,16) : item.setting_value; return next; }); }
    };
    void load();
  }, [path, admin]);

  useEffect(() => {
    if (!(path === '/acp' || path === '/acp/') || !admin) return;
    const refresh = () => { void api<typeof liveUsers>('/api/v2/admin/live-users').then(setLiveUsers).catch(() => {}); };
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [path, admin]);

  const privateRoute = path === '/app' || path.startsWith('/app/');
  const productSlug = path.match(/^\/produkty\/([^/]+)$/)?.[1] ? decodeURIComponent(path.match(/^\/produkty\/([^/]+)$/)![1]) : '';
  const selectedProduct = useMemo(() => products.find((p) => p.product_key === productSlug), [products, productSlug]);
  const filteredProducts = useMemo(() => products.filter((p) => (category === 'all' || (p.category_slug || 'inne') === category) && `${p.title} ${p.description} ${p.target_audience || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [products, category, search]);
  const ordersForView = orders;
  const selectedWorkoutPlan = plans.find(plan => plan.id === workoutPlanChoice) || plans[0];
  const selectedWorkoutDay = selectedWorkoutPlan?.days.find(day => day.day_key === workoutDayChoice) || selectedWorkoutPlan?.days[0];
  const profileComplete = Boolean(profile.first_name.trim() && profile.primary_goal && profile.training_location && profile.training_days_per_week);
  const samplePlanNames = [SAMPLE_PLANS.home.name, SAMPLE_PLANS.gym.name];
  const customPlansCount = plans.filter(plan => !samplePlanNames.includes(plan.name) && !plan.is_individual_plan).length;
  const canCreateTrainingPlan = customPlansCount < trainingPlanLimit;

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setLoading(true);
    try {
      if (authMode === 'recovery') { go('/pomoc'); return; }
      if (authMode === 'signup' && password !== passwordAgain) throw new Error('Hasła nie są identyczne.');
      if (authMode === 'signup' && (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password))) throw new Error('Hasło musi mieć minimum 8 znaków, wielką i małą literę, cyfrę oraz znak specjalny.');
      const result = await api<{ user: User }>(authMode === 'signup' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password, rememberMe: true }) });
      const requestedNext = new URLSearchParams(route.split('?')[1] || '').get('next') || '/app';
      const safeNext = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/app';
      // Do not briefly render ACP for a regular account after client-side login.
      // Check administrator rights before changing the route; when site lock is active,
      // perform a full navigation so the Worker serves the maintenance page immediately.
      if (safeNext === '/acp' || safeNext.startsWith('/acp/')) {
        // A failed permission request is not proof that the user is not an administrator.
        // Surface the verification error instead of incorrectly sending an admin to maintenance.
        let permission: { isAdmin: boolean };
        try {
          permission = await api<{ isAdmin: boolean }>('/api/admin/me');
        } catch {
          throw new Error('Nie udało się zweryfikować uprawnień administratora. Spróbuj ponownie.');
        }
        if (!permission.isAdmin) {
          const lock = await api<{ enabled: boolean; unlocked: boolean }>('/api/v2/site-lock/status').catch(() => ({ enabled: false, unlocked: false }));
          setPassword(''); setPasswordAgain('');
          if (lock.enabled && !lock.unlocked) {
            window.location.replace('/maintenance');
            return;
          }
          setAdmin(false); setAdminReady(false); setUser(result.user);
          go('/app', true);
          notify('Ten panel jest dostępny wyłącznie dla administratora.', 'error');
          return;
        }
        // Critical fix: mark the user as an admin before routing to /acp.
        // Otherwise the route guard sees the stale admin=false state and redirects to maintenance.
        setAdmin(true);
      }
      // Require a fresh admin check for this newly authenticated session.
      // This prevents adminReady=true from the logged-out state leaking into the next render.
      setAdminReady(false);
      setUser(result.user); setPassword(''); setPasswordAgain(''); notify(authMode === 'signup' ? 'Konto zostało utworzone.' : 'Zalogowano pomyślnie.', 'success');
      go(safeNext, true);
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się wykonać operacji.', 'error'); }
    finally { setLoading(false); }
  }
  async function signOut() { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } finally { setUser(null); setAdmin(false); go('/', true); notify('Wylogowano.', 'success'); } }
  async function buy(product: Product) {
    if (!user) { go(`/login?next=${encodeURIComponent(`/produkty/${product.product_key}`)}`); return; }
    setLoading(true);
    try {
      if (product.is_free) { await api(`/api/products/${encodeURIComponent(product.product_key)}/claim`, { method: 'POST', body: '{}' }); notify('Materiał dodano do Twojej biblioteki.', 'success'); await refreshUserData(); go('/app/materialy'); return; }
      // Zdarzenie checkout_started zapisuje API dopiero po utworzeniu sesji Stripe; unikamy podwójnego zliczania.
      let analyticsSession = ''; try { if (consent === 'yes') analyticsSession = sessionStorage.getItem('sf-v2-analytics-session') || ''; } catch {}
      const r = await api<{ url?: string; free?: boolean }>('/api/v2/checkout/session', { method: 'POST', body: JSON.stringify({ product_key: product.product_key, promotion_code: productCode.trim(), analytics_session_key: analyticsSession }) });
      if (r.free) { notify('Kod pokrył pełną cenę. Materiał jest dostępny na koncie.', 'success'); await refreshUserData(); go('/app/materialy'); }
      else if (r.url) window.location.assign(r.url);
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się rozpocząć zakupu.', 'error'); }
    finally { setLoading(false); }
  }
  async function purchaseGeneratorPlan(): Promise<void> {
    if (!user) { go(`/login?next=${encodeURIComponent('/app/plan/katalog')}`); return; }
    setLoading(true);
    try {
      const response = await api<{ url?: string; free?: boolean }>('/api/v2/checkout/session', {
        method: 'POST', body: JSON.stringify({ product_key: 'generator-planu-treningowego', promotion_code: '', analytics_session_key: '' }),
      });
      if (response.url) window.location.assign(response.url);
      else if (response.free) { await refreshUserData(); notify('Dostęp do generatora został odblokowany.', 'success'); }
      else throw new Error('Nie otrzymano linku do płatności. Spróbuj ponownie.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Nie udało się rozpocząć płatności.', 'error'); }
    finally { setLoading(false); }
  }

  async function submitIndividualPlanRequest(values: Record<string, string>): Promise<boolean> {
    setLoading(true);
    try {
      try { sessionStorage.setItem('sf-individual-plan-form-v1', JSON.stringify(values)); } catch { /* optional form restoration */ }
      let requestId = '';
      try { requestId = sessionStorage.getItem('sf-individual-plan-request-id') || ''; } catch { /* optional storage */ }
      const response = await api<{ url?: string; request_id?: string }>('/api/v2/training/individual-plan-checkout', {
        method: 'POST', body: JSON.stringify({ ...values, request_id: requestId }),
      });
      if (!response.url || !response.request_id) throw new Error('Nie udało się przygotować płatności. Spróbuj ponownie.');
      try { sessionStorage.setItem('sf-individual-plan-request-id', response.request_id); } catch { /* optional storage */ }
      window.location.assign(response.url);
      return true;
    } finally { setLoading(false); }
  }

  async function saveIndividualPlanRequestAdmin(request: IndividualPlanOrder, status: string): Promise<void> {
    try {
      await api<{ ok: boolean }>(`/api/v2/admin/individual-plan-requests/${encodeURIComponent(request.id)}`, { method: 'PATCH', body: JSON.stringify({ status, admin_note: request.admin_note || '' }) });
      const result = await api<{ requests: IndividualPlanOrder[] }>('/api/v2/admin/individual-plan-requests');
      const requests = result.requests || [];
      setIndividualPlanOrders(requests);
      notify(status === 'ready' ? 'Status „Zrealizowany” zapisany. Plan pojawi się na koncie klienta; możesz samodzielnie wysłać mu e-mail.' : status === 'in_preparation' ? 'Status „Realizowany” zapisany.' : 'Zapisano status zamówienia planu indywidualnego.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Nie udało się zapisać zamówienia.', 'error'); }
  }

  async function saveIndividualTrainingPlanAdmin(request: IndividualPlanOrder): Promise<void> {
    const draft = individualPlanDrafts[request.id];
    if (!draft) { notify('Nie znaleziono edytora planu dla tego zamówienia.', 'error'); return; }
    try {
      const days = parseIndividualPlanText(draft.plan_text);
      await api<{ ok: boolean; training_plan_id: string }>(`/api/v2/admin/individual-plan-requests/${encodeURIComponent(request.id)}/plan`, {
        method: 'PUT', body: JSON.stringify({ name: draft.name, description: draft.description, start_date: draft.start_date, progression_strategy: draft.progression_strategy, days }),
      });
      const result = await api<{ requests: IndividualPlanOrder[] }>('/api/v2/admin/individual-plan-requests');
      const requests = result.requests || [];
      setIndividualPlanOrders(requests);
      setIndividualPlanDrafts(Object.fromEntries(requests.map(item => [item.id, individualPlanDraftFromRequest(item)])));
      notify('Plan zapisany i przypisany do konta klienta. Będzie widoczny dla niego po ustawieniu statusu „Zrealizowany”.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Nie udało się zapisać planu treningowego.', 'error'); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await api('/api/account/profile', { method: 'PUT', body: JSON.stringify(profile) }); notify('Profil zapisany.', 'success'); await refreshUserData(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać profilu.', 'error'); } finally { setLoading(false); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmNewPassword) { notify('Nowe hasła nie są identyczne.', 'error'); return; }
    if (newPassword.length < 8 || newPassword.length > 128 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9\s]/.test(newPassword)) { notify('Hasło musi mieć minimum 8 znaków, wielką i małą literę, cyfrę oraz znak specjalny.', 'error'); return; }
    setLoading(true);
    try { await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setUser(null); setAdmin(false); go('/login', true); notify('Hasło zmieniono. Ze względów bezpieczeństwa zaloguj się ponownie.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zmienić hasła.', 'error'); }
    finally { setLoading(false); }
  }
  async function deleteTrainingPlan(planId: string) {
    const target = plans.find(plan => plan.id === planId);
    if (!target) { notify('Nie znaleziono wybranego planu. Odśwież bibliotekę i spróbuj ponownie.', 'error'); return; }
    if (!window.confirm(`Usunąć plan „${target.name}”?\n\nTej operacji nie można cofnąć. Jeśli to plan indywidualny, zamówienie pozostanie w historii, ale wróci do statusu „Realizowany”, aby plan można było przygotować ponownie.`)) return;
    setLoading(true);
    try {
      const result = await api<{ ok: boolean; order_returned_to_preparation?: boolean }>(`/api/v2/training/plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
      setPlans(current => current.filter(plan => plan.id !== planId));
      if (activePlanId === planId) {
        setActivePlanId(''); setPlanName(''); setPlanDescription(''); setPlanDays([{ day_key: 'A', title: 'Dzień 1', exercises: [] }]);
      }
      await refreshUserData();
      if (path === '/app/plan/edytor' && activePlanId === planId) go('/app/plan');
      notify(result.order_returned_to_preparation ? 'Plan usunięty. Zamówienie indywidualne wróciło do statusu „Realizowany” i można przypisać do niego nowy plan.' : 'Plan treningowy został usunięty.', result.order_returned_to_preparation ? 'info' : 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Nie udało się usunąć planu. Odśwież stronę i spróbuj ponownie.', 'error');
    } finally { setLoading(false); }
  }

  async function startWorkoutFromPlan(_planId: string, _planNameValue: string, _day: Day) {
    // Przycisk z panelu/kreatora prowadzi do centrum treningowego.
    // Sesja nie jest tworzona ani oznaczana jako rozpoczęta, dopóki użytkownik
    // sam nie wybierze planu i dnia oraz nie kliknie przycisku startu w centrum.
    go('/app/trening');
    notify('Wybierz plan i dzień w centrum treningowym, aby rozpocząć sesję.', 'info');
  }
  async function startLegacyWorkout(legacy: { day_key: string; title: string; exercises_json: string }) {
    let raw: Array<Record<string, unknown>> = [];
    try { const parsed: unknown = JSON.parse(legacy.exercises_json); if (Array.isArray(parsed)) raw = parsed as Array<Record<string, unknown>>; } catch { raw = []; }
    const exercises = raw.map(ex => ({ name: String(ex.name || ex.exercise_name || ex.title || '').trim(), sets: Number(ex.sets ?? ex.target_sets ?? 3), reps: Number(ex.reps ?? ex.target_reps ?? 10), weight_kg: ex.weight_kg == null ? null : Number(ex.weight_kg) })).filter(ex => ex.name);
    await startWorkoutFromPlan(`legacy:${legacy.day_key}`, 'Plan dotychczasowy', { day_key: legacy.day_key, title: legacy.title || `Dzień ${legacy.day_key}`, exercises });
  }
  async function startEditedPlanDay(day: Day) {
    if (!activePlanId) { notify('Najpierw wybierz zapisany plan.', 'error'); return; }
    setLoading(true);
    try {
      await api(`/api/v2/training/plans/${activePlanId}`, { method: 'PUT', body: JSON.stringify({ name: planName || 'Mój plan', description: `[[SF_LOCATION:${newPlanLocation}]]${planDescription.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, '')}`, days: planDays, duration_weeks: PROGRAM_WEEKS, start_date: planStartDate, progression_strategy: planProgression }) });
      await startWorkoutFromPlan(activePlanId, planName || 'Mój plan', day);
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać planu przed treningiem.', 'error'); }
    finally { setLoading(false); }
  }
  async function addSamplePlan(kind: 'home' | 'gym') {
    const template = SAMPLE_PLANS[kind];
    const existing = plans.find(plan => plan.name === template.name);
    if (existing && existing.days.length) { setActivePlanId(existing.id); setPlanName(existing.name); setPlanDescription(existing.description.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, '')); setNewPlanLocation(kind); setPlanDays(existing.days); setPlanStartDate(existing.start_date || existing.created_at?.slice(0, 10) || today()); setPlanProgression(existing.progression_strategy || 'reps'); setNewPlanStartDate(existing.start_date || existing.created_at?.slice(0, 10) || today()); setNewPlanProgression(existing.progression_strategy || 'reps'); setWorkoutPlanChoice(existing.id); setWorkoutDayChoice(existing.days[0]?.day_key || ''); if (path !== '/app/trening') go('/app/trening'); notify('Ten plan przykładowy jest już zapisany. Otwieram centrum treningowe, aby wybrać dzień.', 'info'); return; }
    setLoading(true);
    try {
      const startDate = existing?.start_date || today();
      const progressionStrategy = existing?.progression_strategy || (kind === 'gym' ? 'weight' : 'reps');
      const description = `[[SF_LOCATION:${kind}]]\n${template.description}`;
      const created = existing ? { plan: existing } : await api<{ plan: Plan }>('/api/v2/training/plans', { method: 'POST', body: JSON.stringify({ name: template.name, description, source: 'sample', duration_weeks: PROGRAM_WEEKS, start_date: startDate, progression_strategy: progressionStrategy }) });
      await api(`/api/v2/training/plans/${created.plan.id}`, { method: 'PUT', body: JSON.stringify({ name: template.name, description, days: template.days, duration_weeks: PROGRAM_WEEKS, start_date: startDate, progression_strategy: progressionStrategy }) });
      const saved: Plan = { ...created.plan, name: template.name, description, days: template.days, duration_weeks: PROGRAM_WEEKS, start_date: startDate, progression_strategy: progressionStrategy, updated_at: new Date().toISOString() };
      setPlans(old => [saved, ...old.filter(plan => plan.id !== saved.id)]); setActivePlanId(saved.id); setPlanName(saved.name); setPlanDescription(template.description); setPlanDays(saved.days); setPlanStartDate(startDate); setPlanProgression(progressionStrategy); setNewPlanStartDate(startDate); setNewPlanProgression(progressionStrategy); setWorkoutPlanChoice(saved.id); setWorkoutDayChoice(saved.days[0]?.day_key || '');
      notify(kind === 'home' ? 'Dodano przykładowy plan domowy bez sprzętu.' : 'Dodano przykładowy plan siłowniany.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się dodać planu przykładowego.', 'error'); }
    finally { setLoading(false); }
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    if (!profile.first_name.trim() || !profile.primary_goal || !profile.training_location || !profile.training_days_per_week) {
      notify('Najpierw uzupełnij podstawowe dane profilu: imię, cel, miejsce treningu i liczbę treningów w tygodniu.', 'info');
      go('/app/profil');
      return;
    }
    if (!canCreateTrainingPlan) {
      notify(trainingIsPremium ? 'Konto Premium pozwala na maksymalnie 3 zapisane plany.' : 'Zwykłe konto pozwala na 1 zapisany plan. Premium zwiększa limit do 3.', 'error');
      return;
    }
    const name = newPlanName.trim();
    const requestedDays = Number(newPlanDayCount);
    if (!name || name.length < 2) { notify('Wpisz nazwę planu (co najmniej 2 znaki).', 'error'); return; }
    if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 7) { notify('Wybierz od 1 do 7 dni treningowych.', 'error'); return; }

    const initialDays: Day[] = Array.from({ length: requestedDays }, (_, index) => ({
      day_key: String.fromCharCode(65 + index),
      title: `Dzień ${index + 1}`,
      exercises: [],
    }));
    const cleanDescription = newPlanDescription.trim();
    const description = `[[SF_LOCATION:${newPlanLocation}]]${cleanDescription ? `\n${cleanDescription}` : ''}`;
    setLoading(true);
    try {
      const created = await api<{ plan: Plan }>('/api/v2/training/plans', {
        method: 'POST',
        body: JSON.stringify({ name, description, duration_weeks: PROGRAM_WEEKS, start_date: newPlanStartDate, progression_strategy: newPlanProgression }),
      });
      try {
        // Save the chosen day structure immediately, so it survives a refresh while the user builds exercises.
        await api(`/api/v2/training/plans/${created.plan.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, days: initialDays, duration_weeks: PROGRAM_WEEKS, start_date: newPlanStartDate, progression_strategy: newPlanProgression }),
        });
      } catch (saveError) {
        // Avoid leaving an empty plan that would consume a user's plan limit if initialization failed.
        try { await api(`/api/v2/training/plans/${created.plan.id}`, { method: 'DELETE' }); } catch { /* best-effort cleanup */ }
        throw saveError;
      }
      const plan: Plan = { ...created.plan, name, description, days: initialDays, duration_weeks: PROGRAM_WEEKS, start_date: newPlanStartDate, progression_strategy: newPlanProgression, updated_at: new Date().toISOString() };
      setPlans(old => [plan, ...old.filter(item => item.id !== plan.id)]);
      setActivePlanId(plan.id);
      setPlanName(plan.name);
      setPlanDescription(cleanDescription);
      setPlanStartDate(newPlanStartDate);
      setPlanProgression(newPlanProgression);
      setPlanDays(initialDays);
      setNewPlanName('');
      setNewPlanDescription('');
      setNewPlanDayCount(3);
      go('/app/plan/edytor');
      notify(`Utworzono program na 4 tygodnie z ${requestedDays} jednostkami treningowymi w tygodniu. Dodaj ćwiczenia do każdego dnia.`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Nie udało się utworzyć planu.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function replacePlanExercisesFromCatalog(request: { location: 'home' | 'gym'; equipment: Array<'bands' | 'dumbbells' | 'bench' | 'squat_rack' | 'pullup_bar'> | 'gym'; exercises: Array<{ key: string; day_title: string; name: string; sets: number; reps: number; notes: string; preferred_name?: string; other_names: string[] }> }): Promise<{ replacements: Array<{ key: string; name: string }> }> {
    // Nazwy zamienników są wybierane z lokalnego katalogu — ten przepływ nie wywołuje AI.
    return replaceExercisesFromCatalog(request);
  }

  async function saveGeneratedPlan(draft: GeneratedPlanDraft) {
    if (!profileComplete) {
      notify('Najpierw uzupełnij podstawowe dane profilu: imię, cel, miejsce treningu i liczbę treningów w tygodniu.', 'info');
      go('/app/profil');
      return;
    }
    if (!canCreateTrainingPlan) {
      notify(trainingIsPremium ? 'Konto Premium pozwala na maksymalnie 3 zapisane plany.' : 'Zwykłe konto pozwala na 1 zapisany plan. Premium zwiększa limit do 3.', 'error');
      return;
    }
    const name = draft.name.trim();
    if (name.length < 2 || draft.days.length < 1 || draft.days.length > 7) {
      notify('Uzupełnij nazwę planu i wybierz od 1 do 7 jednostek treningowych w tygodniu.', 'error');
      return;
    }
    const description = `[[SF_LOCATION:${draft.location}]]\n${draft.description.trim()}`;
    setLoading(true);
    try {
      const created = await api<{ plan: Plan }>('/api/v2/training/plans', {
        method: 'POST',
        body: JSON.stringify({ name, description, source: 'paid_generator', duration_weeks: PROGRAM_WEEKS, start_date: draft.start_date, progression_strategy: draft.progression_strategy }),
      });
      try {
        await api(`/api/v2/training/plans/${created.plan.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, days: draft.days, duration_weeks: PROGRAM_WEEKS, start_date: draft.start_date, progression_strategy: draft.progression_strategy, consume_generator_credit: true }),
        });
      } catch (saveError) {
        try { await api(`/api/v2/training/plans/${created.plan.id}`, { method: 'DELETE' }); } catch { /* best-effort cleanup */ }
        throw saveError;
      }
      const saved: Plan = { ...created.plan, name, description, days: draft.days, duration_weeks: PROGRAM_WEEKS, start_date: draft.start_date, progression_strategy: draft.progression_strategy, updated_at: new Date().toISOString() };
      setPlans(old => [saved, ...old.filter(item => item.id !== saved.id)]);
      setActivePlanId(saved.id);
      setPlanName(name);
      setPlanDescription(draft.description.trim());
      setPlanStartDate(draft.start_date);
      setPlanProgression(draft.progression_strategy);
      setPlanDays(draft.days);
      setNewPlanStartDate(draft.start_date);
      setNewPlanProgression(draft.progression_strategy);
      setNewPlanLocation(draft.location);
      setWorkoutPlanChoice(saved.id);
      setWorkoutDayChoice(draft.days[0]?.day_key || '');
      try { window.sessionStorage.removeItem('sf-generator-plan-settings-v1'); } catch { /* opcjonalny zapis ustawień */ }
      go('/app/plan/edytor');
      notify('Plan z katalogu ćwiczeń został utworzony. Możesz teraz dopracować ćwiczenia i zapisać zmiany.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Nie udało się zapisać planu treningowego.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!activePlanId) return;
    if (planDays.length < 1 || planDays.length > 7) { notify('Plan musi zawierać od 1 do 7 dni.', 'error'); return; }
    for (let dayIndex = 0; dayIndex < planDays.length; dayIndex++) {
      const day = planDays[dayIndex];
      if (!day.title.trim()) { notify(`Uzupełnij nazwę dnia ${dayIndex + 1}.`, 'error'); return; }
      if (!day.exercises.length) { notify(`Dodaj przynajmniej jedno ćwiczenie do: ${day.title}.`, 'error'); return; }
      if (day.exercises.length > 40) { notify(`Dzień ${dayIndex + 1} przekracza limit 40 ćwiczeń.`, 'error'); return; }
      for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex++) {
        const ex = day.exercises[exerciseIndex];
        if (!ex.name.trim()) { notify(`Uzupełnij nazwę ćwiczenia ${exerciseIndex + 1} w dniu ${dayIndex + 1}.`, 'error'); return; }
        if (!Number.isInteger(Number(ex.sets)) || Number(ex.sets) < 1 || Number(ex.sets) > 30) { notify(`Sprawdź liczbę serii w ćwiczeniu „${ex.name}”.`, 'error'); return; }
        if (!Number.isInteger(Number(ex.reps)) || Number(ex.reps) < 1 || Number(ex.reps) > 200) { notify(`Sprawdź liczbę powtórzeń w ćwiczeniu „${ex.name}”.`, 'error'); return; }
        if (ex.weight_kg != null && (!Number.isFinite(Number(ex.weight_kg)) || Number(ex.weight_kg) < 0 || Number(ex.weight_kg) > 1000)) { notify(`Sprawdź ciężar w ćwiczeniu „${ex.name}”.`, 'error'); return; }
        if (!Number.isInteger(Number(ex.rest_seconds ?? 90)) || Number(ex.rest_seconds ?? 90) < 0 || Number(ex.rest_seconds ?? 90) > 600) { notify(`Przerwa między seriami w ćwiczeniu „${ex.name}” musi wynosić od 0 do 600 sekund.`, 'error'); return; }
        if (!Number.isInteger(Number(ex.transition_rest_seconds ?? 120)) || Number(ex.transition_rest_seconds ?? 120) < 0 || Number(ex.transition_rest_seconds ?? 120) > 900) { notify(`Przerwa między ćwiczeniami w ćwiczeniu „${ex.name}” musi wynosić od 0 do 900 sekund.`, 'error'); return; }
      }
    }
    setLoading(true);
    try {
      await api(`/api/v2/training/plans/${activePlanId}`, { method: 'PUT', body: JSON.stringify({ name: planName || 'Mój plan', description: `[[SF_LOCATION:${newPlanLocation}]]${planDescription.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, '')}`, days: planDays, duration_weeks: PROGRAM_WEEKS, start_date: planStartDate, progression_strategy: planProgression }) });
      await refreshUserData();
      notify('Plan treningowy zapisany. Wszystkie dni i ćwiczenia są gotowe.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać planu.', 'error'); }
    finally { setLoading(false); }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault(); try { await api('/api/v2/progress/goal', { method: 'PUT', body: JSON.stringify({ goal_title: goalTitle, target_date: goalTargetDate, target_value: goalTargetValue || null, current_value: goalCurrentValue || null, unit: goalUnit }) }); await refreshUserData(); notify('Cel został zapisany.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać celu.', 'error'); }
  }
  async function addMeasurement(event: FormEvent) {
    event.preventDefault(); try { await api('/api/v2/progress/measurements', { method: 'POST', body: JSON.stringify({ measured_on: measurementDate, weight_kg: measurementWeight || null, waist_cm: measurementWaist || null, bodyfat_percent: measurementFat || null }) }); setMeasurementWeight(''); setMeasurementWaist(''); setMeasurementFat(''); await refreshUserData(); notify('Pomiar został zapisany.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać pomiaru.', 'error'); }
  }
  async function submitTicket(event: FormEvent) {
    event.preventDefault(); try { await api('/api/v2/help/tickets', { method: 'POST', body: JSON.stringify({ email, topic: ticketTopic, subject: ticketSubject, message: ticketMessage, order_id: ticketOrderId }) }); setTicketSubject(''); setTicketMessage(''); setTicketOrderId(''); notify('Zgłoszenie zapisano. Obsługa ma je teraz w panelu.', 'success'); if (user) await refreshUserData(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się wysłać zgłoszenia.', 'error'); }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget); const r = await api<{ product: Product }>('/api/admin/products', { method: 'POST', body: form });
      const cover = form.get('cover'); if (cover instanceof File && cover.size) { const coverForm = new FormData(); coverForm.append('product_key', r.product.product_key); coverForm.append('file', cover); await api('/api/v2/admin/covers', { method: 'POST', body: coverForm }); }
      await api(`/api/v2/admin/products/${encodeURIComponent(r.product.product_key)}`, { method: 'PATCH', body: JSON.stringify({ category_slug: productForm.category_slug, target_audience: productForm.target_audience, contents: productForm.contents.split('\n').map(x => x.trim()).filter(Boolean), components: productForm.components.split(',').map(x => x.trim()).filter(Boolean), is_free: productForm.is_free, is_published: productForm.is_published }) });
      setProductForm({ title: '', product_key: '', description: '', product_type: 'ebook', price_amount: '0', is_free: true, is_published: true, category_slug: 'ebooki', target_audience: '', contents: '', components: '' });
      const r2 = await api<{ products: AdminProduct[] }>('/api/v2/admin/products'); setAdminProducts(r2.products || []); notify('Produkt dodany i zapisany w katalogu.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się dodać produktu.', 'error'); }
    finally { setLoading(false); }
  }
  async function saveProduct(product: AdminProduct, form: HTMLFormElement) {
    const data = new FormData(form); const components = String(data.get('components') || '').split(',').map(x => x.trim()).filter(Boolean);
    try { const replacement = data.get('replacement_file'); if (replacement instanceof File && replacement.size) { const fileForm = new FormData(); fileForm.append('file', replacement); await api(`/api/v2/admin/products/${encodeURIComponent(product.product_key)}/file`, { method: 'POST', body: fileForm }); } const cover = data.get('cover'); if (cover instanceof File && cover.size) { const coverForm = new FormData(); coverForm.append('product_key', product.product_key); coverForm.append('file', cover); await api('/api/v2/admin/covers', { method: 'POST', body: coverForm }); } await api(`/api/v2/admin/products/${encodeURIComponent(product.product_key)}`, { method: 'PATCH', body: JSON.stringify({ title: data.get('title'), description: data.get('description'), price_amount: Number(data.get('price_amount')), is_free: data.get('is_free') === 'on', is_published: data.get('is_published') === 'on', product_type: data.get('product_type'), category_slug: data.get('category_slug'), target_audience: data.get('target_audience'), contents: String(data.get('contents') || '').split('\n').map(x => x.trim()).filter(Boolean), components }) });
      const r = await api<{ products: AdminProduct[] }>('/api/v2/admin/products'); setAdminProducts(r.products || []); notify('Zapisano ustawienia produktu.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać produktu.', 'error'); }
  }
  async function createCategory(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/v2/admin/categories', { method: 'POST', body: JSON.stringify(categoryForm) });
      const result = await api<{ products: AdminProduct[]; categories: Category[]; components: Array<{ bundle_key: string; component_product_key: string }> }>('/api/v2/admin/products');
      setAdminProducts(result.products || []); setCategories(result.categories || []);
      setCategoryForm({ slug: '', title: '', description: '' });
      notify('Kategoria została dodana.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się utworzyć kategorii.', 'error'); }
  }
  async function createPromo(event: FormEvent) {
    event.preventDefault();
    const toIso = (value: string) => value ? new Date(value).toISOString() : '';
    try {
      if (promoForm.starts_at && promoForm.ends_at && new Date(promoForm.ends_at).getTime() <= new Date(promoForm.starts_at).getTime()) {
        notify('Data „Ważny do” musi być późniejsza niż „Aktywny od”.', 'error'); return;
      }
      await api('/api/v2/admin/promotions', { method: 'POST', body: JSON.stringify({ ...promoForm, starts_at: toIso(promoForm.starts_at), ends_at: toIso(promoForm.ends_at), discount_value: Number(promoForm.discount_value), max_uses: promoForm.max_uses || null }) });
      const r = await api<{ promotions: Promo[] }>('/api/v2/admin/promotions'); setPromos(r.promotions || []); setPromoForm({ code: '', discount_type: 'percent', discount_value: '10', starts_at: '', ends_at: '', max_uses: '', product_key: '' }); notify('Kod rabatowy utworzony.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się utworzyć kodu.', 'error'); }
  }
  async function saveTicket(ticket: Ticket, status: string) {
    try { await api(`/api/v2/admin/support/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status, admin_note: ticket.admin_note || '' }) }); const r = await api<{ tickets: Ticket[] }>('/api/v2/admin/support'); setAdminTickets(r.tickets || []); notify('Zapisano status zgłoszenia.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zaktualizować zgłoszenia.', 'error'); }
  }
  async function saveSettings(event: FormEvent) { event.preventDefault(); try { await api('/api/v2/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: { ...settings, site_lock_password: '', maintenance_until: settings.maintenance_until ? new Date(settings.maintenance_until).toISOString() : '' } }) }); notify('Ustawienia zapisane.', 'success'); } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać ustawień.', 'error'); } }
  async function setSiteLockPassword() {
    const password = settings.site_lock_password;
    if (password.length < 8 || password.length > 200) { notify('Hasło blokady musi mieć od 8 do 200 znaków.', 'error'); return; }
    try {
      await api('/api/v2/admin/site-lock/password', { method: 'POST', body: JSON.stringify({ password }) });
      setSettings(v => ({ ...v, site_lock_enabled: 'true', site_lock_password: '' }));
      notify('Hasło blokady zapisane. Blokada witryny została włączona.', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać hasła blokady.', 'error'); }
  }
  async function loadFilteredAdminOrders() {
    const params = new URLSearchParams();
    if (adminSearch.trim()) params.set('q', adminSearch.trim());
    if (adminOrderStatus) params.set('status', adminOrderStatus);
    if (adminOrderFrom) params.set('from', adminOrderFrom);
    if (adminOrderTo) params.set('to', adminOrderTo);
    try {
      const result = await api<{ orders: Order[]; items?: OrderItem[] }>(`/api/v2/admin/orders?${params.toString()}`);
      setAdminOrders(result.orders || []);
      setAdminOrderItems(result.items || []);
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się przefiltrować zamówień.', 'error'); }
  }

  async function inspectAdminUser(userId: string) {
    try {
      const detail = await api<NonNullable<typeof selectedAdminUser>>(`/api/v2/admin/users/${encodeURIComponent(userId)}`);
      setSelectedAdminUser(detail);
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się pobrać szczegółów użytkownika.', 'error'); }
  }

  function Header() {
    return <header className="sf-header"><button className="sf-brand" onClick={() => go('/')} aria-label="System Formy — strona główna"><img className="sf-brand-logo" src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="System Formy"/></button><nav className="sf-public-nav"><button onClick={() => go('/')}>Start</button><button onClick={() => go('/produkty')}>Produkty</button><button onClick={() => go('/pomoc')}>Pomoc</button></nav><div className="sf-header-actions">{user ? <><button className="sf-icon-button" title="Menu" aria-label="Otwórz menu" onClick={() => setMenuOpen(v => !v)}><Menu size={20}/></button><button className="sf-button sf-button-lime sf-header-cta" onClick={() => go(admin ? '/acp' : '/app')}>{admin ? 'ACP' : 'Moja aplikacja'} <ArrowRight size={16}/></button></> : <><button className="sf-icon-button sf-public-menu-btn" title="Menu strony" aria-label="Otwórz nawigację strony" onClick={() => setMenuOpen(v => !v)}><Menu size={20}/></button><button className="sf-button sf-button-ghost" onClick={() => { setAuthMode('login'); go('/login'); }}>Zaloguj</button><button className="sf-button sf-button-lime" onClick={() => { setAuthMode('signup'); go('/rejestracja'); }}>Załóż konto</button></>}</div>{menuOpen && <div className="sf-dropdown sf-public-dropdown"><button onClick={() => go('/')}>Strona główna</button><button onClick={() => go('/produkty')}>Wszystkie produkty</button>{categories.map(c => <button key={c.slug} onClick={() => { setCategory(c.slug); go('/produkty'); }}>Kategoria: {c.title}</button>)}<button onClick={() => go('/pomoc')}>Pomoc i kontakt</button>{user ? <><button onClick={() => go('/app/profil')}>Profil i bezpieczeństwo</button><button onClick={() => go('/app/zamowienia')}>Zamówienia</button>{admin && <button onClick={() => go('/acp')}>Panel administratora</button>}<button onClick={() => void signOut()}>Wyloguj</button></> : <><button onClick={() => { setAuthMode('login'); go('/login'); }}>Zaloguj się</button><button onClick={() => { setAuthMode('signup'); go('/rejestracja'); }}>Załóż konto</button></>}</div>}</header>;
  }
  function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) { return <div className="sf-page-title"><div><p className="sf-eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <p className="sf-muted">{subtitle}</p>}</div></div>; }
  function ProductCard({ product }: { product: Product }) { return <article className="sf-product-card"><button className="sf-product-art" onClick={() => go(`/produkty/${product.product_key}`)} aria-label={`Szczegóły: ${product.title}`}>{product.cover_key ? <img className="sf-product-cover" src={`/api/v2/products/${encodeURIComponent(product.product_key)}/cover`} alt={`Okładka: ${product.title}`} loading="lazy"/> : <span className="sf-art-circle"><BookOpen size={28}/></span>}<span className="sf-art-tag">{productTypeLabel(product.product_type)}</span></button><div className="sf-product-copy"><p className="sf-eyebrow">{categories.find(c => c.slug === product.category_slug)?.title || 'SYSTEM FORMY'}</p><h3>{product.title}</h3><p className="sf-muted">{product.description}</p><div className="sf-product-bottom"><strong>{product.is_free ? 'Bezpłatny' : money(product.price_amount, product.currency)}</strong><button className="sf-round-link" onClick={() => go(`/produkty/${product.product_key}`)} aria-label={`Otwórz ${product.title}`}><ArrowRight size={17}/></button></div><button className="sf-button sf-button-outline sf-button-full sf-product-more" onClick={() => go(`/produkty/${product.product_key}`)}>Sprawdź więcej <ArrowRight size={15}/></button></div></article>; }
  function PublicPage() {
    if (path === '/login' || path === '/rejestracja') return <main className="sf-auth-shell"><div className="sf-auth-art"><p className="sf-eyebrow">SYSTEM FORMY / TWOJA PRZESTRZEŃ</p><h1>Trenuj świadomie.<br/><span>Śledź progres.</span></h1><p>Plany, treningi, materiały i postępy — w jednym miejscu.</p><div className="sf-art-stat"><Dumbbell/><div><b>Twój proces. Twoje dane.</b><small>Bez fikcyjnych wyników i pustych wykresów.</small></div></div></div><form className="sf-auth-card" onSubmit={submitAuth}><button type="button" className="sf-back-link" onClick={() => go('/')}><ArrowLeft size={16}/> Wróć na stronę</button><p className="sf-eyebrow">{authMode === 'signup' ? 'NOWE KONTO' : authMode === 'recovery' ? 'POMOC Z DOSTĘPEM' : 'WITAJ PONOWNIE'}</p><h2>{authMode === 'signup' ? 'Zacznij od konta.' : authMode === 'recovery' ? 'Odzyskanie dostępu' : 'Zaloguj się.'}</h2><p className="sf-muted">{authMode === 'signup' ? 'Jedno konto do treningów i zakupionych materiałów.' : 'Zaloguj się, aby wrócić do swojej aplikacji.'}</p>{authMode !== 'recovery' && <><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ty@przyklad.pl"/></label><label>Hasło<input type="password" required autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Hasło"/></label>{authMode === 'signup' && <label>Powtórz hasło<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={passwordAgain} onChange={e => setPasswordAgain(e.target.value)} placeholder="Powtórz hasło"/></label>}</>}{authMode === 'recovery' && <p className="sf-info-note">Automatyczne resetowanie hasła będzie dostępne po skonfigurowaniu wysyłki e-mail. Do tego czasu skorzystaj z formularza pomocy. Nie wyślemy fikcyjnego linku resetującego.</p>}<button className="sf-button sf-button-lime sf-button-full" disabled={loading}>{loading ? 'Chwila…' : authMode === 'signup' ? 'Utwórz konto' : authMode === 'recovery' ? 'Otwórz pomoc' : 'Zaloguj się'} <ArrowRight size={16}/></button>{authMode === 'recovery' ? <button type="button" className="sf-text-button" onClick={() => go('/pomoc')}>Przejdź do pomocy</button> : <div className="sf-auth-switch">{authMode === 'signup' ? 'Masz już konto?' : 'Nie masz jeszcze konta?'} <button type="button" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); go(authMode === 'signup' ? '/login' : '/rejestracja', true); }}>{authMode === 'signup' ? 'Zaloguj się' : 'Załóż konto'}</button></div>}{authMode === 'login' && <button type="button" className="sf-text-button" onClick={() => setAuthMode('recovery')}>Problem z logowaniem?</button>}</form></main>;
    if (path === '/produkty') return <main className="sf-container sf-public-content">{PageTitle({ eyebrow: 'SKLEP / MATERIAŁY', title: 'Znajdź coś dla siebie.', subtitle: 'Przejrzysty katalog materiałów i programów Systemu Formy.' })}<div className="sf-catalog-tools"><label className="sf-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj produktu…" aria-label="Szukaj produktu"/></label><label className="sf-select-wrap"><SlidersHorizontal size={17}/><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">Wszystkie kategorie</option>{categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}</select></label></div>{filteredProducts.length ? <div className="sf-product-grid">{filteredProducts.map(p => ProductCard({ product: p }))}</div> : <div className="sf-empty"><BookOpen size={28}/><h3>Brak wyników</h3><p>Spróbuj innej nazwy lub kategorii.</p></div>}</main>;
    if (productSlug) return <main className="sf-container sf-product-detail">{selectedProduct ? <><button className="sf-back-link" onClick={() => go('/produkty')}><ArrowLeft size={16}/> Wszystkie produkty</button><div className="sf-detail-grid"><div className="sf-detail-art">{selectedProduct.cover_key ? <img className="sf-detail-cover" src={`/api/v2/products/${encodeURIComponent(selectedProduct.product_key)}/cover`} alt={`Okładka: ${selectedProduct.title}`}/> : <span className="sf-art-circle"><BookOpen size={44}/></span>}<p>{productTypeLabel(selectedProduct.product_type)}</p><span className="sf-detail-lime">SYSTEM FORMY</span></div><section className="sf-detail-copy"><p className="sf-eyebrow">{categories.find(c => c.slug === selectedProduct.category_slug)?.title || 'MATERIAŁ CYFROWY'}</p><h1>{selectedProduct.title}</h1><p className="sf-lead">{selectedProduct.description}</p>{selectedProduct.target_audience && <div className="sf-info-note"><b>Dla kogo?</b><p>{selectedProduct.target_audience}</p></div>}<h3>Co znajdziesz w środku</h3>{(selectedProduct.contents || (() => { try { const v = JSON.parse(selectedProduct.contents_json || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })()).length ? <ul className="sf-check-list">{(selectedProduct.contents || (() => { try { const v = JSON.parse(selectedProduct.contents_json || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })()).map((x,i) => <li key={i}><Check size={16}/>{x}</li>)}</ul> : <p className="sf-muted">Szczegóły zawartości zostaną uzupełnione przez administratora.</p>}<div className="sf-purchase-panel"><div><small>CENA</small><strong>{selectedProduct.is_free ? 'Bezpłatny' : (selectedProduct.discount_is_active && Number(selectedProduct.discount_percent)>0 && (!selectedProduct.discount_starts_at || Date.parse(selectedProduct.discount_starts_at)<=Date.now()) && (!selectedProduct.discount_ends_at || Date.parse(selectedProduct.discount_ends_at)>=Date.now()) ? <><del>{money(selectedProduct.price_amount,selectedProduct.currency)}</del> {money(selectedProduct.price_amount*(1-Number(selectedProduct.discount_percent)/100),selectedProduct.currency)} <small>-{selectedProduct.discount_percent}%</small></> : money(selectedProduct.price_amount, selectedProduct.currency))}</strong></div>{!selectedProduct.is_free && <label className="sf-promo-inline"><span>Kod rabatowy</span><input value={productCode} onChange={e => setProductCode(e.target.value.toUpperCase())} placeholder="KOD (opcjonalnie)" maxLength={80}/></label>}<button className="sf-button sf-button-lime sf-button-full" disabled={loading} onClick={() => void buy(selectedProduct)}>{loading ? 'Przetwarzanie…' : selectedProduct.is_free ? 'Odbierz materiał' : 'Kup teraz'} <ArrowRight size={17}/></button><small className="sf-muted">{user ? 'Dostęp przypisujemy do Twojego konta.' : 'Po zalogowaniu materiał będzie przypisany do Twojego konta.'}</small></div></section></div></> : <div className="sf-empty"><h2>Nie znaleziono produktu</h2><button className="sf-button sf-button-lime" onClick={() => go('/produkty')}>Wróć do katalogu</button></div>}</main>;
    if (path === '/regulamin' || path === '/prywatnosc') return <main className="sf-container sf-legal">{PageTitle({ eyebrow: 'DOKUMENTY', title: path === '/regulamin' ? 'Regulamin' : 'Polityka prywatności' })}<div className="sf-content-panel"><p><b>Ważne przed publikacją:</b> treść tego dokumentu wymaga uzupełnienia i weryfikacji przez właściciela Systemu Formy pod kątem faktycznych danych sprzedawcy, działalności i procesów przetwarzania danych.</p>{path === '/regulamin' ? <><h2>Zakres usługi</h2><p>System Formy udostępnia materiały cyfrowe i funkcje treningowe. Szczegółowe zasady sprzedaży, reklamacji, odstąpienia od umowy oraz realizacji dostępu muszą zostać opisane zgodnie z rzeczywistym modelem działalności przed uruchomieniem sprzedaży.</p><h2>Zakupy i dostęp</h2><p>Status płatności ustala serwer na podstawie potwierdzenia od operatora płatności. Samo przekierowanie na stronę po zakupie nie potwierdza płatności.</p><h2>Kontakt</h2><p>W sprawach dotyczących konta, płatności lub dostępu skorzystaj z sekcji pomocy.</p></> : <><h2>Zakres danych</h2><p>Aplikacja przetwarza dane konta, zapisane plany i treningi, historię zamówień oraz materiały udostępnione danemu użytkownikowi. Pomiary treningowe zapisujesz dobrowolnie.</p><h2>Bezpieczeństwo</h2><p>Dane treningowe są powiązane z kontem. Analityka strony jest opcjonalna i uruchamia się po zgodzie użytkownika w interfejsie.</p><h2>Kontakt i okres przechowywania</h2><p>Właściciel serwisu powinien określić podstawy prawne, cele, czas przechowywania, prawa użytkowników i właściwe dane kontaktowe przed publikacją tej polityki.</p></>}</div></main>;
    if (path === '/pomoc' || path === '/app/pomoc') return <main className="sf-container sf-public-content">{PageTitle({ eyebrow: 'CENTRUM POMOCY', title: 'W czym możemy pomóc?', subtitle: 'Zgłoszenie trafia do systemu i jest widoczne w panelu administracyjnym.' })}<div className="sf-help-layout"><div className="sf-content-panel"><div className="sf-icon-tile"><LifeBuoy size={24}/></div><h2>Najczęstsze tematy</h2>{supportEmail && <p className="sf-support-contact">Możesz też napisać: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>}<details><summary>Nie widzę kupionego materiału</summary><p>Sprawdź, czy płatność została potwierdzona. Materiał powinien pojawić się w aplikacji w sekcji „Materiały”.</p></details><details><summary>Nie mogę pobrać pliku</summary><p>Zaloguj się na konto użyte przy zakupie. Jeśli problem się powtarza, wyślij zgłoszenie z numerem zamówienia.</p></details><details><summary>Potrzebuję pomocy z kontem</summary><p>Opisz problem w formularzu. Nie wpisuj hasła ani danych karty płatniczej do wiadomości.</p></details></div><form className="sf-content-panel sf-form-stack" onSubmit={submitTicket}><h2>Wyślij zgłoszenie</h2>{user && orders.length > 0 && <label>Powiązane zamówienie (opcjonalnie)<select value={ticketOrderId} onChange={e=>setTicketOrderId(e.target.value)}><option value="">Nie dotyczy</option>{orders.map(o=><option value={o.id} key={o.id}>{o.display_order_number || o.order_number} · {dateLabel(o.created_at)}</option>)}</select></label>}{!user && <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ty@przyklad.pl"/></label>}<label>Temat<select value={ticketTopic} onChange={e => setTicketTopic(e.target.value)}><option value="access">Dostęp do materiału</option><option value="payment">Płatność lub zamówienie</option><option value="product">Produkt</option><option value="account">Konto</option><option value="other">Inne</option></select></label><label>Temat zgłoszenia<input required minLength={3} maxLength={160} value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} placeholder="Krótko opisz sprawę"/></label><label>Opis problemu<textarea required minLength={8} maxLength={4000} rows={5} value={ticketMessage} onChange={e => setTicketMessage(e.target.value)} placeholder="Co się wydarzyło?"/></label><button className="sf-button sf-button-lime sf-button-full">Wyślij zgłoszenie <ArrowRight size={16}/></button></form></div></main>;
    return <main className="sf-home"><section className="sf-hero"><div className="sf-hero-copy"><p className="sf-eyebrow"><span className="sf-live-dot"/> SYSTEM FORMY / PLATFORMA FITNESS</p><h1>Forma to nie przypadek.<br/><span>To system.</span></h1><p className="sf-hero-lead">Treningi, plany, postępy i materiały, które pomagają działać konsekwentnie — wszystko w jednej przestrzeni.</p><div className="sf-hero-actions"><button className="sf-button sf-button-lime" onClick={() => go(user ? '/app' : '/rejestracja')}>{user ? 'Otwórz pulpit' : 'Zacznij teraz'} <ArrowRight size={17}/></button><button className="sf-button sf-button-ghost" onClick={() => go('/produkty')}>Zobacz ofertę</button></div><div className="sf-hero-proof"><span><CheckCircle2 size={15}/> Własne plany</span><span><CheckCircle2 size={15}/> Historia treningów</span><span><CheckCircle2 size={15}/> Materiały na koncie</span></div></div><div className="sf-hero-visual"><div className="sf-orbit sf-orbit-one"/><div className="sf-orbit sf-orbit-two"/><div className="sf-hero-core"><span>SF</span><small>BUILD YOUR FORM</small></div><div className="sf-float-card sf-float-top"><Activity size={17}/><div><small>TWÓJ RYTM</small><b>Konsekwencja</b></div></div><div className="sf-float-card sf-float-bottom"><TrendingUp size={18}/><div><small>POSTĘPY</small><b>Oparte na danych</b></div></div><div className="sf-hero-spark"><Sparkles size={20}/></div></div></section><section className="sf-home-section sf-container"><div className="sf-section-heading"><div><p className="sf-eyebrow">JEDNA PLATFORMA</p><h2>Wszystko pod kontrolą.</h2></div><button className="sf-text-button" onClick={() => go('/produkty')}>Przejdź do oferty <ArrowRight size={15}/></button></div><div className="sf-feature-grid"><article><Dumbbell/><p className="sf-eyebrow">01 / TRENING</p><h3>Trenuj według planu.</h3><p>Buduj własne plany, zapisuj serie i wracaj do poprzednich sesji.</p></article><article><BarChart3/><p className="sf-eyebrow">02 / POSTĘPY</p><h3>Patrz na realne dane.</h3><p>Regularność, ciężary i pomiary zebrane w przejrzystej historii.</p></article><article><BookOpen/><p className="sf-eyebrow">03 / MATERIAŁY</p><h3>Wiedza pod ręką.</h3><p>Zakupione i bezpłatne materiały dostępne po zalogowaniu.</p></article></div></section><section className="sf-home-section sf-container"><div className="sf-section-heading"><div><p className="sf-eyebrow">WYBRANE MATERIAŁY</p><h2>Zacznij od konkretu.</h2></div><button className="sf-text-button" onClick={() => go('/produkty')}>Cały katalog <ArrowRight size={15}/></button></div>{products.length ? <div className="sf-product-grid">{products.slice(0, 3).map(p => ProductCard({ product: p }))}</div> : <div className="sf-content-panel"><p className="sf-muted">Katalog produktów jest pusty. Wróć później lub skontaktuj się z obsługą.</p></div>}</section></main>;
  }

  const mobileNav = [
    { href: '/app', label: 'Dom', icon: Home }, { href: '/app/trening', label: 'Trening', icon: Dumbbell },
    { href: '/app/plan', label: 'Plan', icon: List }, { href: '/app/postepy', label: 'Postępy', icon: BarChart3 }, { href: '/app/materialy', label: 'Materiały', icon: BookOpen },
  ];
  const sideNav = [
    { href: '/app', label: 'Start', icon: LayoutDashboard }, { href: '/app/trening', label: 'Trening', icon: Dumbbell }, { href: '/app/plan', label: 'Plany treningowe', icon: ClipboardList }, { href: '/app/postepy', label: 'Postępy', icon: TrendingUp }, { href: '/app/materialy', label: 'Materiały', icon: BookOpen }, { href: '/app/zamowienia', label: 'Zamówienia', icon: ShoppingBag }, { href: '/app/profil', label: 'Profil i bezpieczeństwo', icon: UserRound }, { href: '/app/pomoc', label: 'Pomoc', icon: LifeBuoy },
  ];
  function AppLayout() {
    const section = path === '/app' || path === '/app/' ? `Cześć${profile.first_name ? `, ${profile.first_name}` : ''}` : (sideNav.find(n => n.href === path)?.label || 'Twoja aplikacja');
    const weekStart = new Date(monday() + 'T12:00:00');
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      const key = String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(date).replace('.', '');
      return { key, day: date.getDate(), weekday, completed: sessions.some(session => session.performed_on === key), isToday: key === today() };
    });
    const weekCount = sessions.filter(session => session.performed_on >= weekDays[0].key && session.performed_on <= weekDays[6].key).length;
    const recent = sessions.slice(0, 4);
    const challengeProducts = products.filter(product => /wyzwa|challenge/i.test([product.title, product.product_type, product.category_slug || '', categories.find(category => category.slug === product.category_slug)?.title || ''].join(' ')));
    const publishedProducts = products.filter(product => product.is_published !== 0);
    const featuredProducts = publishedProducts.slice(0, 3);
    const featuredProductsTitle = 'Polecane materiały';
    const latestMeasurement = progress.measurements[0] || null;
    return <div className="sf-app-shell"><aside className="sf-sidebar"><button className="sf-brand sf-sidebar-brand" onClick={() => go('/app')}><img className="sf-brand-logo" src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="System Formy"/></button><div className="sf-sidebar-label">TWOJA PRZESTRZEŃ</div><nav className="sf-side-nav">{sideNav.map(n => { const Icon = n.icon; return <button key={n.href} className={path === n.href ? 'is-active' : ''} title={n.label} aria-label={n.label} onClick={() => go(n.href)}><Icon size={18}/><span>{n.label}</span></button>; })}</nav><div className="sf-sidebar-spacer"/><div className="sf-sidebar-user"><span className="sf-avatar">{(profile.first_name || user?.email || 'U').slice(0, 1).toUpperCase()}</span><span><b>{profile.first_name || 'Twoje konto'}</b><small>{user?.email}</small></span><button className="sf-icon-button" title="Wyloguj" aria-label="Wyloguj" onClick={() => void signOut()}><LogOut size={17}/></button></div>{admin && <button className="sf-acp-shortcut" onClick={() => go('/acp')}><ShieldCheck size={17}/> Otwórz ACP <ArrowRight size={15}/></button>}</aside><main className="sf-app-main"><header className="sf-app-top"><div><p className="sf-eyebrow">SYSTEM FORMY / TWOJA APLIKACJA</p><h1>{section}</h1></div><button className="sf-icon-button sf-app-menu-btn" title="Menu" aria-label="Otwórz menu" onClick={() => setMenuOpen(v => !v)}><Menu size={20}/></button>{menuOpen && <div className="sf-dropdown sf-app-dropdown">{sideNav.map(n => <button key={n.href} onClick={() => go(n.href)}>{n.label}</button>)}{admin && <button onClick={() => go('/acp')}>Panel administratora</button>}<button onClick={() => go('/produkty')}>Sklep</button><button onClick={() => void signOut()}>Wyloguj</button></div>}</header>{path === '/app' || path === '/app/' ? <div className="sf-dashboard">
<section className="sf-welcome-card sf-dashboard-main-card">
  <div className="sf-dashboard-week-area">
    <p className="sf-eyebrow">{dateLabel(today())} / TWÓJ PLAN</p>
    <h2>Twój tydzień</h2>
    <p className="sf-dashboard-intro">Zobacz zapisane treningi i zaplanuj kolejny krok.</p>
    <div className="sf-week-days">{weekDays.map(day => <div key={day.key} className={"sf-week-day " + (day.isToday ? "is-today " : "") + (day.completed ? "is-complete" : "")}><span className="sf-week-day-label">{day.weekday}</span><span className="sf-week-day-circle">{day.completed ? <Check size={15}/> : day.day}</span></div>)}</div>
  </div>
  <div className="sf-dashboard-week-count"><span className="sf-welcome-ring"><span><b>{weekCount}</b><small>{weekCount === 1 ? 'TRENING' : weekCount >= 2 && weekCount <= 4 ? 'TRENINGI' : 'TRENINGÓW'}<br/>W TYM TYG.</small></span></span><div className="sf-week-count-caption">Zapisane w tym tygodniu</div></div>
  <div className="sf-welcome-actions sf-welcome-actions-full"><button className="sf-button sf-button-lime" onClick={() => window.location.assign('/app/trening')}>Rozpocznij trening <Dumbbell size={17}/></button><button className="sf-button sf-button-outline sf-challenge-cta" onClick={() => go(challengeProducts[0] ? '/produkty/' + challengeProducts[0].product_key : '/produkty')}>Podejmij wyzwanie <Sparkles size={16}/></button></div>
  <div className="sf-next-workout"><div className="sf-next-workout-heading"><span className="sf-stat-icon"><ClipboardList size={18}/></span><div><p className="sf-eyebrow">NAJBLIŻSZY TRENING</p><h3>{plans[0]?.days[0]?.title || legacyPlans[0]?.title || (plans[0]?.name ? plans[0].name : 'Twój kolejny trening')}</h3></div></div>
    {plans[0]?.days[0] ? <><p className="sf-next-workout-plan">Plan: {plans[0].name} · {plans[0].days[0].exercises.length} ćwiczeń</p><div className="sf-next-workout-exercises">{plans[0].days[0].exercises.slice(0, 4).map((exercise, index) => <span key={index}>{exercise.name}</span>)}</div><button className="sf-text-button" onClick={() => { setActivePlanId(plans[0].id); go('/app/plan'); }}>Zobacz plan <ArrowRight size={15}/></button></> : legacyPlans[0] ? <><p className="sf-next-workout-plan">Dotychczasowy plan treningowy</p><div className="sf-next-workout-exercises">{decodeExercises(legacyPlans[0].exercises_json).slice(0,4).map((exercise,index)=><span key={index}>{exercise.name}</span>)}</div><button className="sf-text-button" onClick={() => void startLegacyWorkout(legacyPlans[0])}>Rozpocznij ten trening <ArrowRight size={15}/></button></> : <div className="sf-empty-inline"><p>Nie masz jeszcze zapisanego planu. Utwórz lub wybierz plan, a pokażemy tutaj skrót najbliższej sesji.</p><button className="sf-button sf-button-outline" onClick={() => go('/app/plan')}>Wybierz plan <ArrowRight size={15}/></button></div>}
  </div>
</section>

<div className="sf-dashboard-feature-grid"><section className="sf-panel sf-dashboard-activity"><div className="sf-panel-heading"><div><p className="sf-eyebrow">OSTATNIA AKTYWNOŚĆ</p><h3>Ostatni trening</h3></div><button className="sf-icon-button" title="Zobacz historię" aria-label="Zobacz historię" onClick={() => go('/app/postepy')}><ArrowRight size={17}/></button></div>{recent.length ? <><div className="sf-last-workout-summary"><span className="sf-list-icon"><Dumbbell size={18}/></span><div><b>{recent[0].title}</b><small>{dateLabel(recent[0].performed_on)} · {decodeExercises(recent[0].exercises_json).length} ćwiczeń</small></div></div><div className="sf-last-workout-exercises">{decodeExercises(recent[0].exercises_json).slice(0,4).map((exercise,index)=><span key={index}>{exercise.name}</span>)}</div></> : <div className="sf-empty-inline"><p>Po zapisaniu pierwszego treningu pojawi się tutaj jego skrót.</p><button className="sf-button sf-button-outline" onClick={() => window.location.assign('/app/trening')}>Rozpocznij trening <ArrowRight size={15}/></button></div>}</section>
<section className="sf-panel sf-dashboard-measurements"><div className="sf-panel-heading"><div><p className="sf-eyebrow">TWOJE DANE</p><h3>Ostatnie pomiary</h3></div><button className="sf-icon-button" title="Zobacz postępy" aria-label="Zobacz postępy" onClick={() => go('/app/postepy')}><ArrowRight size={17}/></button></div>{latestMeasurement ? <p className="sf-measurement-date">Ostatni zapis: {dateLabel(String(latestMeasurement.measured_on || ''))}</p> : <p className="sf-measurement-date">Dane z ostatniego zapisu lub profilu</p>}<div className="sf-measurement-grid"><div><span>Waga</span><b>{latestMeasurement?.weight_kg != null ? String(latestMeasurement.weight_kg) + ' kg' : profile.weight_kg != null ? String(profile.weight_kg) + ' kg' : '—'}</b></div><div><span>Talia</span><b>{latestMeasurement?.waist_cm != null ? String(latestMeasurement.waist_cm) + ' cm' : '—'}</b></div><div><span>Tłuszcz</span><b>{latestMeasurement?.bodyfat_percent != null ? String(latestMeasurement.bodyfat_percent) + '%' : '—'}</b></div><div><span>Wzrost</span><b>{profile.height_cm != null ? String(profile.height_cm) + ' cm' : '—'}</b></div></div><button className="sf-button sf-button-outline sf-button-full" onClick={() => go('/app/postepy')}>Dodaj lub sprawdź pomiary <ArrowRight size={15}/></button></section></div>
<section className="sf-dashboard-training"><div className="sf-panel-heading sf-section-heading"><div><p className="sf-eyebrow">ZACZNIJ DZISIAJ</p><h3>Wybierz swój trening</h3></div><button className="sf-text-button" onClick={() => go('/app/plan')}>Moje plany <ArrowRight size={15}/></button></div><div className="sf-training-promo-grid"><article className="sf-training-promo sf-training-promo-home"><span className="sf-training-promo-icon"><Home size={20}/></span><div><p className="sf-eyebrow">BEZ SPRZĘTU</p><h4>Trening w domu</h4><p>Wróć do zapisanych planów albo dodaj prosty plan domowy.</p></div><button className="sf-button sf-button-outline" onClick={() => window.location.assign('/app/trening')}>Wybierz trening <ArrowRight size={15}/></button></article><article className="sf-training-promo sf-training-promo-gym"><span className="sf-training-promo-icon"><Dumbbell size={20}/></span><div><p className="sf-eyebrow">SIŁOWNIA</p><h4>Trening z obciążeniem</h4><p>Kontynuuj swój plan i zapisuj serie, powtórzenia oraz ciężary.</p></div><button className="sf-button sf-button-outline" onClick={() => go('/app/plan')}>Otwórz plany <ArrowRight size={15}/></button></article></div></section>
<section className="sf-dashboard-library"><div className="sf-panel-heading sf-section-heading"><div><p className="sf-eyebrow">TWOJA BIBLIOTEKA</p><h3>Odblokowane materiały</h3><p className="sf-muted">Dostępne są pozycje przypisane do Twojego konta.</p></div><button className="sf-text-button" onClick={() => go('/app/materialy')}>Wszystkie materiały <ArrowRight size={15}/></button></div>{materials.filter(material => material.product_key !== 'generator-planu-treningowego').slice(0, 3).length ? <div className="sf-dashboard-library-list">{materials.filter(material => material.product_key !== 'generator-planu-treningowego').slice(0, 3).map(material => <div className="sf-list-row" key={material.id}><span className="sf-list-icon"><BookOpen size={17}/></span><span className="sf-list-main"><b>{material.product_title}</b><small>{productTypeLabel(material.product_type)}</small></span><button className="sf-icon-button" title="Pobierz materiał" aria-label={'Pobierz ' + material.product_title} onClick={() => window.location.assign('/api/products/' + encodeURIComponent(material.product_key) + '/download')}><ArrowDownToLine size={17}/></button></div>)}</div> : <div className="sf-empty-inline"><p>Twoja biblioteka jest jeszcze pusta. Odbierz bezpłatny materiał lub kup pozycję w katalogu.</p><button className="sf-button sf-button-outline" onClick={() => go('/produkty')}>Otwórz sklep <ArrowRight size={15}/></button></div>}</section>
<section className="sf-dashboard-products"><div className="sf-panel-heading sf-section-heading"><div><p className="sf-eyebrow">DOSTĘPNE W KATALOGU</p><h3>{featuredProductsTitle}</h3><p className="sf-muted">Wybierz program lub materiał dostępny w katalogu Systemu Formy.</p></div><button className="sf-text-button" onClick={() => go('/produkty')}>Cały katalog <ArrowRight size={15}/></button></div>{featuredProducts.length ? <div className="sf-dashboard-product-grid">{featuredProducts.map(product => <div key={product.product_key} className="sf-dashboard-product-item">{ProductCard({ product })}</div>)}</div> : <div className="sf-empty-inline"><p>W katalogu nie ma jeszcze opublikowanych produktów. Gdy dodasz je w ACP, pojawią się tutaj.</p><button className="sf-button sf-button-outline" onClick={() => go('/produkty')}>Otwórz katalog <ArrowRight size={15}/></button></div>}</section>
</div>
    : path === '/app/trening' ? <TrainingRoute onGoToPlans={() => go('/app/plan')} onBackToDashboard={() => go('/app')} onSaved={refreshUserData} />
     : path === '/app/plan/katalog' ? <PlanGenerator defaultLocation={profile.training_location === 'home' ? 'home' : 'gym'} saving={loading} hasPaidAccess={materials.some(item => item.product_key === 'generator-planu-treningowego' && item.access_status === 'active')} canCreatePlan={canCreateTrainingPlan} onPurchase={purchaseGeneratorPlan} onCancel={() => go('/app/plan')} onSave={saveGeneratedPlan} onReplaceExercises={replacePlanExercisesFromCatalog} />
     : path === '/app/plan/indywidualny' ? <IndividualPlanRequest name={profile.first_name || ''} email={user?.email || ''} saving={loading} onCancel={() => { try { sessionStorage.removeItem('sf-individual-plan-form-v1'); sessionStorage.removeItem('sf-individual-plan-request-id'); } catch { /* optional storage */ } go('/app/plan'); }} onSubmit={submitIndividualPlanRequest} />
     : (path === '/app/plan' || path === '/app/plan/kreator' || path === '/app/plan/edytor') ? (path === '/app/plan' ? <section className="sf-view sf-plan-home-view">
          <div className="sf-plan-home-grid">
            <article className="sf-panel sf-plan-home-card sf-plan-home-create"><span className="sf-plan-home-icon"><Dumbbell size={23}/></span><p className="sf-eyebrow">TWÓJ PLAN, TWOJE ZASADY</p><h2>Stwórz swój plan</h2><p>Ustaw nazwę, liczbę dni oraz miejsce treningu, a potem dodaj własne ćwiczenia.</p><button type="button" className="sf-button sf-button-lime sf-button-full" disabled={!canCreateTrainingPlan} onClick={() => { if (!profileComplete) { notify('Najpierw uzupełnij podstawowe dane profilu, aby tworzyć własne plany.', 'info'); go('/app/profil'); return; } setNewPlanName(''); setNewPlanDescription(''); setNewPlanDayCount(3); setNewPlanLocation(profile.training_location === 'home' ? 'home' : 'gym'); setNewPlanStartDate(today()); setNewPlanProgression('reps'); go('/app/plan/kreator'); }}>{canCreateTrainingPlan ? 'Utwórz nowy plan' : 'Limit własnych planów wykorzystany'} <ArrowRight size={16}/></button>
              <div className="sf-plan-home-divider"><span>ALBO ZACZNIJ SZYBCIEJ</span></div>
              <button type="button" className="sf-button sf-button-outline sf-button-full" disabled={!canCreateTrainingPlan} onClick={() => { if (!profileComplete) { notify('Najpierw uzupełnij podstawowe dane profilu, aby utworzyć plan.', 'info'); go('/app/profil'); return; } go('/app/plan/katalog'); }}><Sparkles size={16}/> Kreator planu z katalogu ćwiczeń · 29,99 zł <ArrowRight size={16}/></button>
              <small className="sf-muted">Własne plany: {customPlansCount}/{trainingPlanLimit}</small><button type="button" className="sf-button sf-button-outline sf-button-full sf-individual-plan-cta" onClick={() => go('/app/plan/indywidualny')}><ClipboardList size={16}/> Zamów plan indywidualny <ArrowRight size={15}/></button>
            </article>
          {plans.length > 0 && <div className="sf-panel sf-plan-home-saved"><div className="sf-panel-heading"><div><p className="sf-eyebrow">TWOJA BIBLIOTEKA</p><h3>Zapisane plany</h3></div><ClipboardList size={19}/></div><div className="sf-plan-library-list">{plans.map(p => <div key={p.id} className="sf-plan-select-row"><button type="button" className="sf-plan-select" onClick={() => { setActivePlanId(p.id); setPlanName(p.name); setPlanStartDate(p.start_date || p.created_at?.slice(0, 10) || today()); setPlanProgression(p.progression_strategy || 'reps'); const match = p.description.match(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/); setNewPlanLocation(match?.[1] === 'home' || (!match && /dom|home/i.test(p.name)) ? 'home' : 'gym'); setPlanDescription(p.description.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, '')); setPlanDays(p.days.length ? p.days : [{day_key:'A',title:'Dzień 1',exercises:[]}]); go('/app/plan/edytor'); }}><span><b>{p.name}</b><small>{p.days.length} treningi/tydz. · 4 tygodnie · {dateLabel(p.start_date || p.created_at?.slice(0, 10))}–{dateLabel(getProgramEndDate(p.start_date || p.created_at?.slice(0, 10), p.duration_weeks || PROGRAM_WEEKS))}</small></span><ArrowRight size={16}/></button><button type="button" className="sf-plan-delete-button" title={`Usuń plan: ${p.name}`} aria-label={`Usuń plan: ${p.name}`} disabled={loading} onClick={() => void deleteTrainingPlan(p.id)}><Trash2 size={16}/></button></div>)}</div></div>}
                        <article className="sf-panel sf-plan-home-card sf-plan-home-samples"><span className="sf-plan-home-icon"><ClipboardList size={23}/></span><p className="sf-eyebrow">GOTOWE DO UŻYCIA</p><h2>Przykładowe plany</h2><p>Nie musisz budować planu od zera. Wybierz gotowy trening domowy albo siłowniany.</p>
              <div className="sf-plan-home-sample-list">{(['home','gym'] as const).map(kind => { const sample = SAMPLE_PLANS[kind]; const existing = plans.find(plan => plan.name === sample.name); return <div className="sf-plan-home-sample" key={kind}><span className="sf-plan-sample-icon">{kind === 'home' ? <Home size={18}/> : <Dumbbell size={18}/>}</span><div><b>{kind === 'home' ? 'Trening w domu' : 'Trening na siłowni'}</b><small>{sample.days.length} treningi/tydz. · program 4-tygodniowy · {sample.description}</small></div><button type="button" className="sf-icon-button" disabled={loading} aria-label={existing ? 'Otwórz przykładowy plan' : 'Dodaj przykładowy plan'} onClick={() => void addSamplePlan(kind)}><ArrowRight size={16}/></button></div>; })}</div>
            </article>
          </div>

        </section> : path === '/app/plan/kreator' ? <section className="sf-view sf-plan-wizard-view">
          <button type="button" className="sf-back-link" onClick={() => go('/app/plan')}><ArrowLeft size={16}/> Wróć do planów</button>
          {PageTitle({ eyebrow: 'KROK 1 Z 2', title: 'Ustaw podstawy planu.', subtitle: 'Najpierw określ, jaki plan chcesz zbudować. Potem przejdziesz do osobnego edytora ćwiczeń.' })}
          {canCreateTrainingPlan ? <form className="sf-panel sf-form-stack sf-plan-create-screen" onSubmit={createPlan}>
            <div className="sf-create-plan-kicker"><span><Plus size={17}/></span><div><p className="sf-eyebrow">NOWY PLAN TRENINGOWY</p><h2>Jak ma wyglądać Twój plan?</h2></div></div>
            <label>Nazwa planu<input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} minLength={2} maxLength={120} required placeholder="np. Budowanie siły"/></label>
            <label>Opis planu <span className="sf-optional-label">opcjonalnie</span><textarea value={newPlanDescription} onChange={e => setNewPlanDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Na czym chcesz się skupić? Co chcesz poprawić?"/></label>
            <div className="sf-create-days-picker"><div className="sf-create-days-heading"><span>Liczba dni treningowych</span><strong>{newPlanDayCount}</strong></div><p>Wybierz liczbę różnych jednostek w każdym tygodniu czterotygodniowego programu.</p><div className="sf-create-days-chips">{[1,2,3,4,5,6,7].map(count => <button type="button" key={count} className={newPlanDayCount === count ? 'is-active' : ''} onClick={() => setNewPlanDayCount(count)}>{count}</button>)}</div></div>
            <div className="sf-plan-location-picker"><h3>Gdzie będziesz trenować?</h3><p>To ustawienie określa, pod jakie miejsce przygotowujesz plan.</p><div className="sf-plan-location-options"><button type="button" className={newPlanLocation === 'home' ? 'is-active' : ''} onClick={() => setNewPlanLocation('home')}><Home size={22}/><b>W domu</b><small>Ćwiczenia domowe i dostępny sprzęt</small></button><button type="button" className={newPlanLocation === 'gym' ? 'is-active' : ''} onClick={() => setNewPlanLocation('gym')}><Dumbbell size={22}/><b>Na siłowni</b><small>Maszyny, hantle i sprzęt siłowy</small></button></div></div>
            <div className="sf-month-program-fields sf-month-create-fields"><label>Data rozpoczęcia programu<input type="date" required value={newPlanStartDate} onChange={event => setNewPlanStartDate(event.target.value)}/></label><label>Specyfika progresu<select value={newPlanProgression} onChange={event => setNewPlanProgression(event.target.value as ProgressionStrategy)}><option value="reps">Stopniowo zwiększaj powtórzenia</option><option value="weight">Stopniowo zwiększaj ciężar</option><option value="sets">Stopniowo zwiększaj liczbę serii</option><option value="none">Stałe parametry przez 4 tygodnie</option></select></label></div>
            <div className="sf-month-program-explainer"><b>Program na 4 tygodnie (28 dni)</b><span>Tworzysz od 1 do 7 jednostek treningowych w tygodniu. Każdy tydzień korzysta z tego układu, a wybrana progresja ustala parametry kolejnych tygodni.</span></div>
            <button type="submit" className="sf-button sf-button-lime sf-button-full" disabled={loading}>{loading ? 'Tworzę plan…' : 'Utwórz plan i przejdź do edytora'} <ArrowRight size={16}/></button>
            <small className="sf-create-plan-footnote"><ShieldCheck size={13}/> Plan zostanie zapisany na koncie. Ćwiczenia dodasz na następnym ekranie.</small>
          </form> : <div className="sf-panel sf-plan-limit-notice"><div className="sf-plan-limit-icon"><LockKeyhole size={18}/></div><h4>Limit własnych planów wykorzystany</h4><p>{trainingIsPremium ? 'Konto Premium pozwala zapisać do 3 własnych planów.' : 'Na zwykłym koncie możesz mieć 1 własny plan. Premium zwiększa limit do 3.'} Możesz wrócić do zapisanych planów i edytować istniejący.</p><button className="sf-button sf-button-outline" onClick={() => go('/app/plan')}>Wróć do planów</button></div>}
        </section> : <section className="sf-view sf-plan-editor-view">
          <button type="button" className="sf-back-link" onClick={() => go('/app/plan')}><ArrowLeft size={16}/> Wróć do biblioteki planów</button>
          {PageTitle({ eyebrow: 'KROK 2 Z 2', title: activePlanId ? 'Edytuj swój plan.' : 'Wybierz plan do edycji.', subtitle: 'Dodawaj ćwiczenia, ustawiaj serie, powtórzenia i przerwy, a potem zapisz całość.' })}
          {plans.length > 1 && <div className="sf-panel sf-plan-editor-picker"><label>Edytowany plan<select value={activePlanId} onChange={e => { const p = plans.find(item => item.id === e.target.value); if (!p) return; setActivePlanId(p.id); setPlanName(p.name); setPlanStartDate(p.start_date || p.created_at?.slice(0, 10) || today()); setPlanProgression(p.progression_strategy || 'reps'); const match = p.description.match(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/); setNewPlanLocation(match?.[1] === 'home' || (!match && /dom|home/i.test(p.name)) ? 'home' : 'gym'); setPlanDescription(p.description.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, '')); setPlanDays(p.days.length ? p.days : [{day_key:'A',title:'Dzień 1',exercises:[]}]); }}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>}
          {activePlanId ? <div className="sf-panel sf-plan-editor-panel"><div className="sf-panel-heading sf-plan-editor-heading"><div><p className="sf-eyebrow">KREATOR KROK PO KROKU</p><h3>Edytor planu</h3><p>Zmiany zapiszesz przyciskiem na dole.</p></div><button type="button" className="sf-text-button sf-danger-text" disabled={loading} onClick={() => void deleteTrainingPlan(activePlanId)}><Trash2 size={15}/> {loading ? 'Usuwam…' : 'Usuń plan'}</button></div><form className="sf-form-stack sf-plan-edit-form" onSubmit={savePlan}><div className="sf-plan-meta-fields"><label>Nazwa planu<input value={planName} onChange={e => { setPlanName(e.target.value); setPlans(old => old.map(p => p.id === activePlanId ? {...p,name:e.target.value} : p)); }} required minLength={2} maxLength={120}/></label><label>Opis planu <span className="sf-optional-label">opcjonalnie</span><textarea value={planDescription} onChange={e => setPlanDescription(e.target.value.replace(/^\[\[SF_LOCATION:(home|gym)\]\]\n?/, ''))} maxLength={1000} rows={2}/></label></div><div className="sf-plan-location-summary"><span>{newPlanLocation === 'home' ? <Home size={17}/> : <Dumbbell size={17}/>}</span><div><b>Plan przygotowany: {newPlanLocation === 'home' ? 'do treningu w domu' : 'na siłownię'}</b><small>Jeśli chcesz zmienić miejsce, wróć do ustawień planu lub wybierz właściwą opcję przed zapisem.</small></div><button type="button" className="sf-button sf-button-outline sf-button-sm" onClick={() => setNewPlanLocation(old => old === 'home' ? 'gym' : 'home')}>Zmień</button></div><PlanBuilder key={activePlanId} days={planDays} setDays={setPlanDays} location={newPlanLocation} loading={loading} progressionStrategy={planProgression} setProgressionStrategy={setPlanProgression} startDate={planStartDate} setStartDate={setPlanStartDate}/><div className="sf-builder-save-bar"><div><CheckCircle2 size={18}/><span><b>Gotowe do zapisania?</b><small>Sprawdzę kompletność ćwiczeń i parametrów przed zapisem.</small></span></div><button type="submit" className="sf-button sf-button-lime" disabled={loading}>{loading ? 'Zapisuję…' : 'Zapisz plan i wszystkie dni'} <Check size={16}/></button></div></form></div> : <div className="sf-panel sf-plan-editor-empty"><h3>Nie wybrano planu</h3><p>Wróć do biblioteki i utwórz nowy plan albo wybierz zapisany plan.</p><button type="button" className="sf-button sf-button-lime" onClick={() => go('/app/plan/kreator')}>Utwórz nowy plan</button></div>}
        </section>)
: path === '/app/postepy' ? <section className="sf-view">{PageTitle({ eyebrow: 'DANE, NIE DOMYSŁY', title: 'Postępy i wyniki.', subtitle: 'Podsumowania są liczone z zapisanych sesji. Brak historii oznacza brak wykresu — nie fikcyjne wartości.' })}<div className="sf-stat-grid"><div className="sf-stat-card"><span className="sf-stat-icon"><Dumbbell/></span><small>WSZYSTKIE TRENINGI</small><b>{progress.session_count}</b><span className="sf-muted">Zapisane sesje</span></div><div className="sf-stat-card"><span className="sf-stat-icon"><TrendingUp/></span><small>ĆWICZENIA Z REKORDEM</small><b>{Object.keys(progress.records).length}</b><span className="sf-muted">Wyniki z historii</span></div><div className="sf-stat-card"><span className="sf-stat-icon"><Activity/></span><small>POMIARY</small><b>{progress.measurements.length}</b><span className="sf-muted">Dobrowolnie zapisane</span></div></div><div className="sf-two-col">{progress.goal && !goalEditing ? <section className="sf-panel sf-goal-card">
<div className="sf-panel-heading"><h3>Twój cel</h3><button type="button" className="sf-button sf-button-outline" onClick={() => setGoalEditing(true)}>Edytuj cel <Settings size={15}/></button></div>
<p className="sf-goal-title">{progress.goal.goal_title}</p>
<div className="sf-goal-details"><div><small>Aktualny wynik</small><b>{progress.goal.current_value ?? '—'} {progress.goal.unit || ''}</b></div><div><small>Cel do osiągnięcia</small><b>{progress.goal.target_value ?? '—'} {progress.goal.unit || ''}</b></div><div><small>Termin</small><b>{dateLabel(progress.goal.target_date)}</b></div></div>
<div className="sf-progress-track"><i style={{width: `${progress.goal.target_value && progress.goal.current_value != null ? Math.min(100, Math.max(0, Number(progress.goal.current_value)/Number(progress.goal.target_value)*100)) : 0}%`}}/></div>
<p className="sf-muted">Wynik możesz zmienić w dowolnym momencie, np. po poprawieniu maksymalnej liczby pompek.</p>
<button type="button" className="sf-button sf-button-lime sf-button-full" onClick={() => setGoalEditing(true)}>Aktualizuj wynik lub termin <ArrowRight size={15}/></button>
</section> : <form className="sf-panel sf-form-stack" onSubmit={saveGoal}>
<div className="sf-panel-heading"><h3>{progress.goal ? 'Edytuj cel i wynik' : 'Ustal swój cel'}</h3><Goal size={18}/></div>
<label>Nazwa celu<input required minLength={2} maxLength={160} value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="np. Pompki"/></label>
<label>Termin<input type="date" value={goalTargetDate} onChange={e => setGoalTargetDate(e.target.value)}/></label>
<div className="sf-form-grid"><label>Wartość docelowa<input type="number" min="0" max="1000000" value={goalTargetValue} onChange={e => setGoalTargetValue(e.target.value)} step="any" placeholder="np. 30"/></label><label>Aktualny wynik<input type="number" min="0" max="1000000" value={goalCurrentValue} onChange={e => setGoalCurrentValue(e.target.value)} step="any" placeholder="np. 15"/></label></div>
<label>Jednostka<input value={goalUnit} onChange={e => setGoalUnit(e.target.value)} maxLength={32} placeholder="kg, cm, powtórzenia…"/></label>
<div className="sf-inline-action-row"><button className="sf-button sf-button-lime">{progress.goal ? 'Zapisz zmiany celu' : 'Zapisz cel'} <Check size={16}/></button>{progress.goal && <button type="button" className="sf-button sf-button-outline" onClick={() => { setGoalTitle(progress.goal?.goal_title || ''); setGoalTargetDate(progress.goal?.target_date || ''); setGoalTargetValue(progress.goal?.target_value == null ? '' : String(progress.goal.target_value)); setGoalCurrentValue(progress.goal?.current_value == null ? '' : String(progress.goal.current_value)); setGoalUnit(progress.goal?.unit || ''); setGoalEditing(false); }}>Anuluj</button>}</div>
</form>}
<form className="sf-panel sf-form-stack" onSubmit={addMeasurement}><div className="sf-panel-heading"><h3>Dodaj pomiar</h3><Activity size={18}/></div><label>Data pomiaru<input type="date" required value={measurementDate} onChange={e => setMeasurementDate(e.target.value)}/></label><div className="sf-form-grid"><label>Waga (kg)<input type="number" min="20" max="400" step="0.1" value={measurementWeight} onChange={e => setMeasurementWeight(e.target.value)}/></label><label>Talia (cm)<input type="number" min="20" max="300" step="0.1" value={measurementWaist} onChange={e => setMeasurementWaist(e.target.value)}/></label></div><label>Poziom tkanki tłuszczowej (%)<input type="number" min="1" max="80" step="0.1" value={measurementFat} onChange={e => setMeasurementFat(e.target.value)}/></label><button className="sf-button sf-button-lime">Zapisz pomiar <Plus size={16}/></button></form></div><div className="sf-two-col"><section className="sf-panel"><div className="sf-panel-heading"><h3>Regularność tygodniowa</h3><BarChart3 size={18}/></div>{Object.keys(progress.weekly).length ? <div className="sf-week-chart">{Object.entries(progress.weekly).sort(([a],[b]) => a.localeCompare(b)).slice(-12).map(([week,count]) => { const weeklyCount = Number(count) || 0; return <div key={week}><span>{weeklyCount}</span><i style={{height:`${Math.max(6,weeklyCount/Math.max(1,...Object.values(progress.weekly).map(Number))*100)}%`}}/><small>{week.slice(5)}</small></div>; })}</div> : <div className="sf-empty-inline"><p>Brak danych historycznych. Pierwszy tydzień zaczniemy liczyć od zapisanych sesji.</p></div>}</section><section className="sf-panel"><div className="sf-panel-heading"><h3>Najlepsze zapisane wyniki</h3><TrendingUp size={18}/></div>{Object.entries(progress.records).length ? Object.entries(progress.records).sort(([,a],[,b]) => b.weight-a.weight).slice(0,12).map(([name,value]) => <div className="sf-list-row" key={name}><span className="sf-list-icon"><Dumbbell size={16}/></span><span className="sf-list-main"><b>{name}</b><small>{dateLabel(value.date)} · {value.reps} powt.</small></span><strong>{value.weight} kg</strong></div>) : <p className="sf-muted">Rekordy pojawią się po zapisaniu ciężaru w seriach.</p>}</section></div><section className="sf-panel"><div className="sf-panel-heading"><h3>Historia pomiarów</h3><Activity size={18}/></div>{progress.measurements.length ? <div className="sf-table-wrap"><table><thead><tr><th>Data</th><th>Waga</th><th>Talia</th><th>Tłuszcz</th></tr></thead><tbody>{progress.measurements.map((m,i) => <tr key={String(m.id || i)}><td>{dateLabel(String(m.measured_on || ''))}</td><td>{m.weight_kg == null ? '—' : `${m.weight_kg} kg`}</td><td>{m.waist_cm == null ? '—' : `${m.waist_cm} cm`}</td><td>{m.bodyfat_percent == null ? '—' : `${m.bodyfat_percent}%`}</td></tr>)}</tbody></table></div> : <p className="sf-muted">Nie zapisano jeszcze pomiarów.</p>}</section><section className="sf-panel"><div className="sf-panel-heading"><h3>Historia treningów</h3><button className="sf-text-button" onClick={() => go('/app/trening')}>Nowy trening <Plus size={15}/></button></div>{sessions.map(s => <details className="sf-history-item" key={s.id}><summary><span><b>{s.title}</b><small>{dateLabel(s.performed_on)}</small></span><ChevronDown size={16}/></summary>{decodeExercises(s.exercises_json).map((e,i) => <div className="sf-history-ex" key={i}><b>{e.name}</b><span>{e.sets_detail.map((x,j) => `S${j+1}: ${x.weight_kg ?? '—'} kg × ${x.reps}`).join(' · ')}</span></div>)}</details>)}</section></section>
    : path === '/app/materialy' ? <section className="sf-view">{PageTitle({ eyebrow: 'TWOJA BIBLIOTEKA', title: 'Odblokowane materiały.', subtitle: 'Dostęp pochodzi z zapisanych uprawnień na koncie.' })}{materials.filter(m => m.product_key !== 'generator-planu-treningowego').length ? <div className="sf-product-grid">{materials.filter(m => m.product_key !== 'generator-planu-treningowego').map(m => <article className="sf-product-card" key={m.id}><div className="sf-product-art"><span className="sf-art-circle"><BookOpen size={28}/></span><span className="sf-art-tag">{productTypeLabel(m.product_type)}</span></div><div className="sf-product-copy"><h3>{m.product_title}</h3><p className="sf-muted">Odblokowano: {dateLabel(m.created_at)}</p><button className="sf-button sf-button-lime sf-button-full" onClick={() => window.location.assign(`/api/products/${encodeURIComponent(m.product_key)}/download`)}><ArrowDownToLine size={16}/> Pobierz materiał</button></div></article>)}</div> : <div className="sf-empty"><BookOpen size={32}/><h3>Biblioteka jest pusta</h3><p>Gdy odbierzesz bezpłatny materiał lub zakończy się płatność, pojawi się tutaj.</p><button className="sf-button sf-button-lime" onClick={() => go('/produkty')}>Przeglądaj produkty <ArrowRight size={16}/></button></div>}</section>
    : path === '/app/zamowienia' ? <section className="sf-view">{PageTitle({ eyebrow: 'HISTORIA ZAKUPÓW', title: 'Twoje zamówienia.', subtitle: 'Tutaj sprawdzisz status każdego zamówienia i osobno postęp realizacji swoich planów indywidualnych.' })}{individualPlanPaymentConfirmed && <div className="sf-info-note" role="status"><b>Płatność 149,99 zł została potwierdzona.</b><p>Twoja ankieta została zapisana. Plan przygotujemy w ciągu 24 godzin, a w okresach większej liczby zamówień do 48 godzin. Gdy status zmieni się na „Zrealizowany”, plan pojawi się w sekcji „Plany treningowe”. Wiadomość e-mail wyśle administrator ręcznie.</p></div>}{individualPlanUserOrders.length > 0 && <div className="sf-panel sf-form-stack"><h3>Realizacja planów indywidualnych</h3><p className="sf-muted">Każda pozycja dotyczy osobnego zamówienia — status jednego planu nie zmienia statusu pozostałych.</p>{individualPlanUserOrders.map(plan => <div className="sf-list-row" key={plan.id}><span className="sf-list-icon"><ClipboardList size={17}/></span><span className="sf-list-main"><b>{plan.status === 'ready' && plan.training_plan_name ? plan.training_plan_name : 'Indywidualny plan treningowy'}</b><small>Zamówienie {plan.display_order_number || '—'} · {dateLabel(plan.created_at)}</small><small><span className={`sf-status sf-status-${plan.status}`}>{individualPlanStatusLabel(plan.status, plan.payment_status)}</span></small>{plan.status === 'ready' && <small>Twój plan jest gotowy i dostępny w aplikacji.</small>}{plan.status === 'in_preparation' && <small>Przygotowujemy Twój plan treningowy.</small>}{plan.status === 'awaiting_questionnaire' && <small>Płatność została przyjęta. Zamówienie oczekuje na rozpoczęcie realizacji.</small>}</span>{plan.status === 'ready' && <button className="sf-button sf-button-outline" onClick={() => go('/app/plan')}>Otwórz plan <ArrowRight size={15}/></button>}</div>)}</div>}{ordersForView.length ? <div className="sf-panel"><div className="sf-table-wrap"><table><thead><tr><th>Numer</th><th>Data</th><th>Produkty</th><th>Status</th><th>Kwota</th></tr></thead><tbody>{ordersForView.map(o => <tr key={o.id}><td><b>{o.display_order_number || o.order_number}</b></td><td>{dateLabel(o.created_at)}</td><td>{orderItems.filter(i => i.order_id === o.id).map(i => i.product_title).join(', ') || '—'}</td><td><span className={`sf-status sf-status-${o.status}`}>{orderStatusLabel(o.status)}</span></td><td>{money(o.total_amount,o.currency)}</td></tr>)}</tbody></table></div></div> : individualPlanUserOrders.length === 0 ? <div className="sf-empty"><ShoppingBag size={30}/><h3>Nie masz jeszcze zamówień</h3><p>Po zakupie szczegóły będą widoczne w tej sekcji.</p><button className="sf-button sf-button-lime" onClick={() => go('/produkty')}>Zobacz katalog <ArrowRight size={16}/></button></div> : null}</section>
    : path === '/app/profil' ? <section className="sf-view">{PageTitle({ eyebrow: 'KONTO I BEZPIECZEŃSTWO', title: 'Twój profil.', subtitle: 'Zapisane dane pomagają personalizować panel. Pola opcjonalne możesz pozostawić puste.' })}<div className="sf-two-col"><form className="sf-panel sf-form-stack" onSubmit={saveProfile}><h3>Dane i preferencje</h3><label>Imię<input maxLength={80} value={profile.first_name} onChange={e => setProfile(v => ({...v,first_name:e.target.value}))}/></label><label>Główny cel<select value={profile.primary_goal} onChange={e => setProfile(v => ({...v,primary_goal:e.target.value}))}><option value="">Nie wybrano</option><option value="muscle">Budowanie mięśni</option><option value="fat_loss">Redukcja</option><option value="strength">Zwiększenie siły</option><option value="consistency">Regularność</option><option value="health">Ogólna sprawność</option></select></label><label>Miejsce treningu<select value={profile.training_location} onChange={e => setProfile(v => ({...v,training_location:e.target.value}))}><option value="">Nie wybrano</option><option value="gym">Siłownia</option><option value="home">Dom</option><option value="both">Dom i siłownia</option></select></label><div className="sf-form-grid"><label>Waga (kg)<input type="number" min="20" max="400" step="0.1" value={profile.weight_kg ?? ''} onChange={e => setProfile(v => ({...v,weight_kg:e.target.value === '' ? null : Number(e.target.value)}))}/></label><label>Wzrost (cm)<input type="number" min="80" max="260" value={profile.height_cm ?? ''} onChange={e => setProfile(v => ({...v,height_cm:e.target.value === '' ? null : Number(e.target.value)}))}/></label></div><label>Treningi w tygodniu<select value={profile.training_days_per_week ?? ''} onChange={e => setProfile(v => ({...v,training_days_per_week:e.target.value === '' ? null : Number(e.target.value)}))}><option value="">Nie określono</option>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button className="sf-button sf-button-lime" disabled={loading}>Zapisz profil <Check size={16}/></button></form><div className="sf-panel sf-form-stack"><h3>Bezpieczeństwo</h3><div className="sf-security-row"><span className="sf-icon-tile"><Mail size={18}/></span><div><b>Adres e-mail</b><small>{user?.email}</small></div><ShieldCheck size={18}/></div><form className="sf-form-stack sf-password-form" onSubmit={changePassword}><div className="sf-security-row"><span className="sf-icon-tile"><KeyRound size={18}/></span><div><b>Zmiana hasła</b><small>Wymaga podania obecnego hasła. Po zapisaniu trzeba zalogować się ponownie.</small></div></div><label>Obecne hasło<input type="password" required minLength={1} maxLength={128} autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>Nowe hasło<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Powtórz nowe hasło<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmNewPassword} onChange={e=>setConfirmNewPassword(e.target.value)}/></label><small className="sf-muted">Minimum 8 znaków, wielka i mała litera, cyfra oraz znak specjalny.</small><button className="sf-button sf-button-outline" disabled={loading}>Zmień hasło <KeyRound size={15}/></button></form><div className="sf-security-row"><span className="sf-icon-tile"><LockKeyhole size={18}/></span><div><b>Sesja konta</b><small>Możesz zakończyć sesję na tym urządzeniu.</small></div></div><button className="sf-button sf-button-danger" onClick={() => void signOut()}><LogOut size={16}/> Wyloguj</button></div></div></section>
    : path === '/app/pomoc' ? <section className="sf-view">{PageTitle({ eyebrow: 'POMOC I KONTAKT', title: 'Zgłoś problem.', subtitle: 'Wysłane zgłoszenia są trwale zapisywane i widoczne dla obsługi.' })}<div className="sf-two-col"><form className="sf-panel sf-form-stack" onSubmit={submitTicket}>{orders.length > 0 && <label>Powiązane zamówienie (opcjonalnie)<select value={ticketOrderId} onChange={e=>setTicketOrderId(e.target.value)}><option value="">Nie dotyczy</option>{orders.map(o=><option value={o.id} key={o.id}>{o.display_order_number || o.order_number} · {dateLabel(o.created_at)}</option>)}</select></label>}<label>Temat<select value={ticketTopic} onChange={e => setTicketTopic(e.target.value)}><option value="access">Dostęp do materiału</option><option value="payment">Płatność</option><option value="product">Produkt</option><option value="account">Konto</option><option value="other">Inne</option></select></label><label>Tytuł<input required minLength={3} maxLength={160} value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}/></label><label>Opis<textarea required minLength={8} maxLength={4000} rows={6} value={ticketMessage} onChange={e => setTicketMessage(e.target.value)}/></label><button className="sf-button sf-button-lime">Wyślij zgłoszenie <ArrowRight size={16}/></button></form><section className="sf-panel"><h3>Twoje zgłoszenia</h3>{tickets.length ? tickets.map(t => <details className="sf-history-item" key={t.id}><summary><span><b>{t.subject}</b><small>{dateLabel(t.created_at)} · {t.status}</small></span><ChevronDown size={16}/></summary><p>{t.message}</p>{t.admin_note && <div className="sf-info-note">Odpowiedź obsługi: {t.admin_note}</div>}</details>) : <p className="sf-muted">Nie wysłano jeszcze zgłoszeń.</p>}</section></div></section> : <div className="sf-empty"><CircleHelp size={30}/><h3>Nie znaleziono sekcji</h3><button className="sf-button sf-button-lime" onClick={() => go('/app')}>Wróć na pulpit</button></div>}{loading && <div className="sf-page-loading" aria-live="polite"><span/></div>}</main><nav className="sf-mobile-nav" aria-label="Nawigacja aplikacji">{mobileNav.map(n => { const Icon=n.icon; return <button key={n.href} className={path === n.href ? 'is-active' : ''} title={n.label} aria-label={n.label} onClick={() => go(n.href)}><Icon size={20}/><span>{n.label}</span></button>; })}</nav></div>;
  }

  function AdminLayout() {
    const nav = [ { href: '/acp', label: 'Pulpit', icon: Gauge }, { href: '/acp/produkty', label: 'Produkty', icon: BookOpen }, { href: '/acp/zamowienia', label: 'Zamówienia', icon: ShoppingBag }, { href: '/acp/uzytkownicy', label: 'Użytkownicy', icon: Users }, { href: '/acp/platnosci', label: 'Płatności', icon: WalletCards }, { href: '/acp/statystyki', label: 'Statystyki', icon: BarChart3 }, { href: '/acp/promocje', label: 'Promocje', icon: Sparkles }, { href: '/acp/plany-indywidualne', label: 'Plany indywidualne', icon: ClipboardList }, { href: '/acp/pomoc', label: 'Pomoc', icon: LifeBuoy }, { href: '/acp/ustawienia', label: 'Ustawienia', icon: Settings } ];
    const title = nav.find(n => n.href === path)?.label || 'Panel administracyjny';
    const summaryValue = (key: string, subkey: string) => { const obj = adminSummary[key]; return obj && typeof obj === 'object' && subkey in obj ? String((obj as Record<string, unknown>)[subkey]) : '0'; };
    return <div className="sf-app-shell sf-acp-shell"><aside className="sf-sidebar"><button className="sf-brand sf-sidebar-brand" onClick={() => go('/acp')}><img className="sf-brand-logo" src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="System Formy"/></button><div className="sf-acp-label"><ShieldCheck size={16}/> PANEL ADMINISTRATORA</div><nav className="sf-side-nav">{nav.map(n => {const Icon=n.icon; return <button key={n.href} className={path === n.href ? 'is-active' : ''} title={n.label} aria-label={n.label} onClick={() => go(n.href)}><Icon size={18}/><span>{n.label}</span></button>;})}</nav><div className="sf-sidebar-spacer"/><button className="sf-acp-shortcut" onClick={() => go('/app')}><ArrowLeft size={16}/> Aplikacja użytkownika</button><button className="sf-acp-shortcut" onClick={() => go('/')}><Home size={16}/> Strona publiczna</button><button className="sf-acp-shortcut" onClick={() => void signOut()}><LogOut size={16}/> Wyloguj</button></aside><main className="sf-app-main"><header className="sf-app-top"><div><p className="sf-eyebrow">SYSTEM FORMY / ACP</p><h1>{title}</h1></div><span className="sf-acp-chip"><ShieldCheck size={15}/> Zweryfikowany administrator</span><button className="sf-icon-button sf-app-menu-btn" title="Menu" aria-label="Otwórz menu ACP" onClick={() => setMenuOpen(v => !v)}><Menu size={20}/></button></header>{path === '/acp' || path === '/acp/' ? <section className="sf-view">{PageTitle({ eyebrow: 'PANEL ADMINISTRACYJNY', title: 'Witaj w ACP.', subtitle: 'Podsumowania oparte na zapisanych zamówieniach, użytkownikach i zgłoszeniach.' })}<div className="sf-stat-grid"><div className="sf-stat-card"><span className="sf-stat-icon"><WalletCards/></span><small>SPRZEDAŻ POTWIERDZONA</small><b>{money(Number((adminSummary.sales as Record<string,unknown> | undefined)?.revenue || 0))}</b><span className="sf-muted">Opłacone / zrealizowane zamówienia</span></div><div className="sf-stat-card"><span className="sf-stat-icon"><ShoppingBag/></span><small>ZAMÓWIENIA · 30 DNI</small><b>{summaryValue('last_30_days_orders','count')}</b><span className="sf-muted">Zapisane zamówienia</span></div><div className="sf-stat-card"><span className="sf-stat-icon"><Users/></span><small>KONTA</small><b>{summaryValue('users','count')}</b><span className="sf-muted">Zarejestrowani użytkownicy</span></div><div className="sf-stat-card"><span className="sf-stat-icon"><LifeBuoy/></span><small>OTWARTE ZGŁOSZENIA</small><b>{summaryValue('open_tickets','count')}</b><span className="sf-muted">Wymagające odpowiedzi</span></div></div><section className="sf-panel sf-live-presence"><div className="sf-panel-heading"><div><h3>Aktywni użytkownicy teraz</h3><small className="sf-muted">Dane na żywo · aktywność z ostatnich 90 sekund</small></div><span className="sf-status is-active"><Activity size={13}/> NA ŻYWO</span></div><div className="sf-stat-grid"><div className="sf-stat-card"><small>AKTYWNE SESJE</small><b>{liveUsers.active_visitors}</b><span className="sf-muted">Wszystkie bieżące odwiedziny</span></div><div className="sf-stat-card"><small>ZALOGOWANE KONTA</small><b>{liveUsers.active_users}</b><span className="sf-muted">Unikalni zalogowani użytkownicy</span></div></div>{liveUsers.visitors.length ? <div className="sf-table-wrap"><table><thead><tr><th>Użytkownik</th><th>Aktualna ścieżka</th><th>Status</th><th>Ostatni sygnał</th></tr></thead><tbody>{liveUsers.visitors.map((v,i)=><tr key={`${v.email||'anon'}-${v.path}-${i}`}><td>{v.email || 'Gość'}</td><td><code>{v.path}</code></td><td>{v.authenticated ? 'Zalogowany' : 'Gość'}</td><td>{new Date(v.last_seen).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td></tr>)}</tbody></table></div> : <p className="sf-muted">Brak aktywnych odwiedzających w tej chwili. Statystyki odświeżają się automatycznie co 30 sekund.</p>}</section><section className="sf-panel"><div className="sf-panel-heading"><h3>Ostatnie działania administratora</h3><ClipboardList size={18}/></div>{adminAudit.length ? <div className="sf-table-wrap"><table><thead><tr><th>Data</th><th>Administrator</th><th>Działanie</th><th>Obiekt</th></tr></thead><tbody>{adminAudit.slice(0,12).map(a=><tr key={a.id}><td>{new Date(a.created_at).toLocaleString('pl-PL')}</td><td>{a.actor_email}</td><td>{a.action.replaceAll('_', ' ')}</td><td>{a.entity_type} · {a.entity_id}</td></tr>)}</tbody></table></div> : <p className="sf-muted">Brak zapisanych działań administracyjnych. Dziennik zacznie się zapełniać po nowych zmianach.</p>}</section><div className="sf-panel"><div className="sf-panel-heading"><h3>Ostatnie zamówienia</h3><button className="sf-text-button" onClick={() => go('/acp/zamowienia')}>Wszystkie <ArrowRight size={15}/></button></div>{Array.isArray(adminSummary.recent_orders) && (adminSummary.recent_orders as Order[]).length ? <div className="sf-table-wrap"><table><thead><tr><th>Numer</th><th>Użytkownik</th><th>Status</th><th>Kwota</th></tr></thead><tbody>{(adminSummary.recent_orders as Order[]).map(o => <tr key={o.id}><td><b>{o.display_order_number || o.order_number}</b></td><td>{o.email}</td><td>{orderStatusLabel(o.status)}</td><td>{money(o.total_amount,o.currency)}</td></tr>)}</tbody></table></div> : <p className="sf-muted">Brak zamówień do wyświetlenia.</p>}</div></section>
    : path.startsWith('/acp/produkty') ? <section className="sf-view">{PageTitle({ eyebrow: 'KATALOG I PUBLIKACJA', title: 'Produkty i pakiety.', subtitle: 'Ukrycie oferty nie usuwa historii zakupów. Uprawnienia do plików są weryfikowane po stronie Workera.' })}<div className="sf-two-col"><form className="sf-panel sf-form-stack" onSubmit={createProduct}><h3>Dodaj produkt</h3><label>Nazwa<input required minLength={2} maxLength={140} name="title" value={productForm.title} onChange={e => setProductForm(v => ({...v,title:e.target.value}))}/></label><label>Klucz produktu<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} name="product_key" value={productForm.product_key} onChange={e => setProductForm(v => ({...v,product_key:e.target.value}))}/></label><label>Opis<textarea required minLength={2} maxLength={2000} name="description" value={productForm.description} onChange={e => setProductForm(v => ({...v,description:e.target.value}))}/></label><div className="sf-form-grid"><label>Typ<select name="product_type" value={productForm.product_type} onChange={e => setProductForm(v => ({...v,product_type:e.target.value}))}><option value="ebook">E-book / PDF</option><option value="training_plan">Plan treningowy</option><option value="guide">Poradnik</option><option value="bundle">Pakiet</option><option value="other">Inny</option></select></label><label>Cena (PLN)<input required type="number" min="0" max="100000" step="0.01" name="price_amount" value={productForm.price_amount} onChange={e => setProductForm(v => ({...v,price_amount:e.target.value}))}/></label></div><label>Kategoria<select name="category_slug" value={productForm.category_slug} onChange={e => setProductForm(v => ({...v,category_slug:e.target.value}))}>{categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}</select></label><label>Dla kogo?<input name="target_audience" maxLength={500} value={productForm.target_audience} onChange={e => setProductForm(v => ({...v,target_audience:e.target.value}))}/></label><label>Zawartość (jeden punkt w linii)<textarea name="contents" rows={3} value={productForm.contents} onChange={e => setProductForm(v => ({...v,contents:e.target.value}))}/></label>{productForm.product_type === 'bundle' && <label>Klucze produktów w pakiecie (po przecinku)<input value={productForm.components} onChange={e => setProductForm(v => ({...v,components:e.target.value}))} placeholder="plan-startowy, trening-w-domu"/><small className="sf-muted">Najpierw dodaj produkty składowe. Po zapisaniu pakietu każdy materiał otrzyma osobne sprawdzenie uprawnień.</small></label>}<label>Plik produktu<input name="file" type="file" accept=".pdf,.xlsx,.docx,.zip,.csv,.txt" required={productForm.product_key !== 'generator-planu-treningowego'}/>{productForm.product_key === 'generator-planu-treningowego' && <small className="sf-muted">Generator nie jest plikiem do pobrania — plik nie jest potrzebny.</small>}</label><label>Okładka produktu (opcjonalnie, do 4 MB)<input name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/avif"/></label><label className="sf-check"><input type="checkbox" name="is_free" checked={productForm.is_free} value="true" onChange={e => setProductForm(v => ({...v,is_free:e.target.checked,price_amount:e.target.checked ? '0' : (v.price_amount === '0' ? '29' : v.price_amount)}))}/> Produkt bezpłatny</label><label className="sf-check"><input type="checkbox" name="is_published" checked={productForm.is_published} value="true" onChange={e => setProductForm(v => ({...v,is_published:e.target.checked}))}/> Publikuj od razu</label><button className="sf-button sf-button-lime" disabled={loading}><Plus size={15}/> Dodaj produkt</button></form><div className="sf-panel"><div className="sf-panel-heading"><h3>Katalog ({adminProducts.length})</h3><Search size={18}/></div><label className="sf-search"><Search size={16}/><input value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Szukaj produktu…"/></label><div className="sf-admin-product-list">{adminProducts.filter(p => `${p.title} ${p.product_key}`.toLowerCase().includes(adminSearch.toLowerCase())).map(p => <details className="sf-admin-product" key={p.product_key}><summary><span><b>{p.title}</b><small>{p.product_key} · {p.is_published ? 'Opublikowany' : 'Ukryty'} · {p.is_free ? 'Bezpłatny' : money(p.price_amount,p.currency)}</small></span><ChevronDown size={16}/></summary><form className="sf-form-stack sf-admin-product-form" onSubmit={e => {e.preventDefault();void saveProduct(p,e.currentTarget);}}><label>Nazwa<input name="title" required defaultValue={p.title}/></label><label>Opis<textarea name="description" required defaultValue={p.description}/></label><div className="sf-form-grid"><label>Typ<select name="product_type" defaultValue={p.product_type}><option value="ebook">E-book</option><option value="training_plan">Plan</option><option value="guide">Poradnik</option><option value="bundle">Pakiet</option><option value="other">Inny</option></select></label><label>Cena<input name="price_amount" type="number" min="0" step="0.01" defaultValue={p.price_amount}/></label></div><label>Kategoria<select name="category_slug" defaultValue={p.category_slug || 'inne'}>{categories.map(c => <option value={c.slug} key={c.slug}>{c.title}</option>)}</select></label><label>Dla kogo?<input name="target_audience" defaultValue={p.target_audience || ''}/></label><label>Zawartość<textarea name="contents" defaultValue={(() => {try {return JSON.parse(p.contents_json || '[]').join('\n')} catch {return ''}})()}/></label><label>Zastąp plik do pobrania (opcjonalnie, maks. 25 MB)<input name="replacement_file" type="file" accept=".pdf,.xlsx,.docx,.zip,.csv,.txt"/><small className="sf-muted">Poprzedni plik pozostaje w magazynie; produkt będzie wskazywał nowy plik.</small></label><label>Zmień okładkę (opcjonalnie)<input name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/avif"/></label>{p.product_type === 'bundle' && <label>Klucze produktów w pakiecie (po przecinku)<input name="components" defaultValue={bundleComponents[p.product_key] || ''}/></label>}<label className="sf-check"><input type="checkbox" name="is_free" defaultChecked={Boolean(p.is_free)}/> Bezpłatny</label><label className="sf-check"><input type="checkbox" name="is_published" defaultChecked={Boolean(p.is_published)}/> Opublikowany</label><button className="sf-button sf-button-lime">Zapisz zmiany</button><small className="sf-muted">Historia zamówień nie zostanie usunięta.</small></form></details>)}</div></div></div><section className="sf-panel sf-form-stack"><h3>Bezpośrednie rabaty produktów</h3><p className="sf-muted">Rabat jest naliczany po stronie serwera i trafia do kwoty sesji Stripe. Daty są opcjonalne. Produkty systemowe generatora i planu indywidualnego mają stałe ceny i nie obsługują rabatów.</p>{adminProducts.filter(p=>!p.is_free && p.product_key !== 'generator-planu-treningowego' && p.product_key !== 'plan-indywidualny').map(p=><form key={p.product_key} className="sf-form-stack sf-admin-product-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v2/admin/product-discounts/${encodeURIComponent(p.product_key)}`,{method:'PUT',body:JSON.stringify({discount_percent:Number(f.get('discount_percent')),starts_at:f.get('starts_at')?new Date(String(f.get('starts_at'))).toISOString():'',ends_at:f.get('ends_at')?new Date(String(f.get('ends_at'))).toISOString():'',is_active:f.get('is_active')==='on'})});notify(`Zapisano rabat dla: ${p.title}`,'success');}catch(err){notify(err instanceof Error?err.message:'Nie udało się zapisać rabatu.','error');}}}><b>{p.title}</b><div className="sf-form-grid"><label>Rabat (%)<input type="number" name="discount_percent" min="1" max="99" step="1" defaultValue="10" required/></label><label className="sf-check"><input type="checkbox" name="is_active" defaultChecked/> Aktywny</label></div><div className="sf-form-grid"><label>Aktywny od<input type="datetime-local" name="starts_at"/></label><label>Ważny do<input type="datetime-local" name="ends_at"/></label></div><div className="sf-button-row"><button className="sf-button sf-button-lime">Zapisz rabat</button><button type="button" className="sf-button sf-button-outline" onClick={async()=>{try{await api(`/api/v2/admin/product-discounts/${encodeURIComponent(p.product_key)}`,{method:'DELETE'});notify(`Usunięto rabat: ${p.title}`,'success');}catch(err){notify(err instanceof Error?err.message:'Nie udało się usunąć rabatu.','error');}}}>Usuń rabat</button></div></form>)}</section><form className="sf-panel sf-category-form" onSubmit={createCategory}><h3>Dodaj kategorię</h3><div className="sf-form-grid"><label>Identyfikator (slug)<input required minLength={2} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={categoryForm.slug} onChange={e => setCategoryForm(v => ({...v,slug:e.target.value}))} placeholder="np. trening-w-domu"/></label><label>Nazwa kategorii<input required minLength={2} maxLength={100} value={categoryForm.title} onChange={e => setCategoryForm(v => ({...v,title:e.target.value}))}/></label></div><label>Opis (opcjonalnie)<input maxLength={500} value={categoryForm.description} onChange={e => setCategoryForm(v => ({...v,description:e.target.value}))}/></label><button className="sf-button sf-button-outline"><Plus size={15}/> Dodaj kategorię</button></form></section>
    : path.startsWith('/acp/zamowienia') ? <section className="sf-view">{PageTitle({ eyebrow: 'SPRZEDAŻ', title: 'Zamówienia.', subtitle: 'Szukaj po numerze SF, identyfikatorze technicznym lub e-mailu i filtruj według statusu oraz daty.' })}<label className="sf-search"><Search size={17}/><input value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Szukaj po numerze lub e-mailu…" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void loadFilteredAdminOrders(); } }}/></label><div className="sf-panel sf-admin-order-filters"><label>Status<select value={adminOrderStatus} onChange={e => setAdminOrderStatus(e.target.value)}><option value="">Wszystkie statusy</option><option value="pending">Oczekujące</option><option value="paid">Opłacone</option><option value="processing">W realizacji</option><option value="fulfilled">Zrealizowane</option><option value="canceled">Anulowane</option><option value="refunded">Zwrócone</option></select></label><label>Od daty<input type="date" value={adminOrderFrom} onChange={e => setAdminOrderFrom(e.target.value)}/></label><label>Do daty<input type="date" value={adminOrderTo} onChange={e => setAdminOrderTo(e.target.value)}/></label><button className="sf-button sf-button-outline" type="button" onClick={() => void loadFilteredAdminOrders()}>Filtruj</button></div><div className="sf-panel sf-table-wrap"><table><thead><tr><th>Numer</th><th>Konto</th><th>Data</th><th>Produkty</th><th>Status</th><th>Kwota</th></tr></thead><tbody>{adminOrders.filter(o => !adminSearch || `${o.display_order_number} ${o.order_number} ${o.email || ''}`.toLowerCase().includes(adminSearch.toLowerCase())).map(o => <tr key={o.id}><td><b>{o.display_order_number || o.order_number}</b><small className="sf-table-sub">{o.order_number}</small></td><td>{o.email || o.user_id}</td><td>{dateLabel(o.created_at)}</td><td>{adminOrderItems.filter(i => i.order_id === o.id).map(i => i.product_title).join(', ') || '—'}</td><td><span className={`sf-status sf-status-${o.status}`}>{orderStatusLabel(o.status)}</span></td><td>{money(o.total_amount,o.currency)}</td></tr>)}</tbody></table></div></section>
    : path.startsWith('/acp/uzytkownicy') ? <section className="sf-view">{PageTitle({ eyebrow: 'KONTA I UPRAWNIENIA', title: 'Użytkownicy.', subtitle: 'Widok diagnostyczny — nie ujawnia haseł ani sekretów sesji.' })}<label className="sf-search"><Search size={17}/><input value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Szukaj po e-mailu…"/></label><div className="sf-panel sf-table-wrap"><table><thead><tr><th>E-mail</th><th>Data utworzenia</th><th>Zamówienia</th><th>Wartość zakupów</th><th>Dostępy</th><th>Akcje</th></tr></thead><tbody>{adminUsers.filter(u => String(u.email || '').toLowerCase().includes(adminSearch.toLowerCase())).map(u => <tr key={String(u.id)}><td><button className="sf-text-button" onClick={() => void inspectAdminUser(String(u.id))} title="Otwórz edycję użytkownika">{String(u.email)}</button></td><td>{dateLabel(String(u.created_at || ''))}</td><td>{String(u.order_count)}</td><td>{money(Number(u.paid_total || 0))}</td><td>{String(u.access_count)}</td><td><button className="sf-button sf-button-outline" onClick={() => void inspectAdminUser(String(u.id))}>Edytuj użytkownika</button></td></tr>)}</tbody></table></div>{selectedAdminUser && <div className="sf-user-editor-overlay" role="presentation" onClick={() => setSelectedAdminUser(null)}><div className="sf-user-editor-modal" role="dialog" aria-modal="true" aria-label="Edycja użytkownika" onClick={e => e.stopPropagation()}><section className="sf-panel sf-user-detail"><div className="sf-panel-heading"><div><p className="sf-eyebrow">SZCZEGÓŁY KONTA</p><h3>{String(selectedAdminUser.user.email || '')}</h3><small className="sf-muted">Konto od {dateLabel(String(selectedAdminUser.user.created_at || ''))}</small></div><button className="sf-icon-button" aria-label="Zamknij szczegóły użytkownika" onClick={() => setSelectedAdminUser(null)}><X size={17}/></button></div><div className="sf-two-col"><div><h4>Profil</h4><p>{String(selectedAdminUser.profile?.first_name || 'Nie uzupełniono imienia')}</p><p className="sf-muted">Cel: {String(selectedAdminUser.profile?.primary_goal || 'Nie wybrano')} · Miejsce: {String(selectedAdminUser.profile?.training_location || 'Nie wybrano')}</p><h4>Ostatnie treningi</h4>{selectedAdminUser.recent_workouts.length ? selectedAdminUser.recent_workouts.slice(0,8).map(w=><div className="sf-list-row" key={String(w.id)}><span className="sf-list-main"><b>{String(w.title)}</b><small>{dateLabel(String(w.performed_on || w.created_at || ''))}</small></span></div>) : <p className="sf-muted">Brak zapisanych treningów.</p>}</div><div><h4>Zamówienia</h4>{selectedAdminUser.orders.length ? selectedAdminUser.orders.slice(0,8).map(o=><div className="sf-list-row" key={o.id}><span className="sf-list-main"><b>{o.display_order_number || o.order_number}</b><small>{orderStatusLabel(o.status)} · {dateLabel(o.created_at)}</small></span><strong>{money(o.total_amount,o.currency)}</strong></div>) : <p className="sf-muted">Brak zamówień.</p>}<h4>Aktywne materiały</h4>{selectedAdminUser.entitlements.filter(e=>e.access_status==='active').length ? selectedAdminUser.entitlements.filter(e=>e.access_status==='active').map(e=><div className="sf-list-row" key={e.id}><span className="sf-list-main"><b>{e.product_title}</b><small>{productTypeLabel(e.product_type)} · od {dateLabel(e.created_at)}</small></span><button className="sf-button sf-button-outline" onClick={async()=>{try{await api(`/api/v2/admin/users/${encodeURIComponent(String(selectedAdminUser.user.id))}/access`,{method:'POST',body:JSON.stringify({product_key:e.product_key,active:false})});await inspectAdminUser(String(selectedAdminUser.user.id));notify('Dostęp do materiału odebrany.','success');}catch(err){notify(err instanceof Error?err.message:'Nie udało się odebrać dostępu.','error');}}}>Odbierz dostęp</button></div>) : <p className="sf-muted">Brak aktywnych materiałów.</p>}</div></div><h4>Zgłoszenia pomocy</h4>{selectedAdminUser.tickets.length ? selectedAdminUser.tickets.slice(0,5).map(t=><div className="sf-list-row" key={String(t.id)}><span className="sf-list-main"><b>{String(t.subject)}</b><small>{String(t.status)} · {dateLabel(String(t.created_at))}</small></span></div>) : <p className="sf-muted">Brak zgłoszeń.</p>}</section>{selectedAdminUser && <div className="sf-panel sf-form-stack"><h3>Edytuj profil użytkownika</h3><form className="sf-form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const number=(key:string)=>String(f.get(key)||'').trim()===''?null:Number(f.get(key));try{await api(`/api/v2/admin/users/${encodeURIComponent(String(selectedAdminUser.user.id))}`,{method:'PATCH',body:JSON.stringify({first_name:String(f.get('first_name')||''),gender:String(f.get('gender')||''),weight_kg:number('weight_kg'),height_cm:number('height_cm'),training_location:String(f.get('training_location')||''),primary_goal:String(f.get('primary_goal')||''),training_days_per_week:number('training_days_per_week')})});notify('Profil użytkownika zapisany.','success');await inspectAdminUser(String(selectedAdminUser.user.id));}catch(err){notify(err instanceof Error?err.message:'Nie udało się zapisać profilu.','error');}}}><div className="sf-two-col"><label>Imię<input name="first_name" maxLength={80} defaultValue={String(selectedAdminUser.profile?.first_name||'')}/></label><label>Płeć<select name="gender" defaultValue={String(selectedAdminUser.profile?.gender||'')}><option value="">Nie ustawiono</option><option value="female">Kobieta</option><option value="male">Mężczyzna</option><option value="other">Inna</option><option value="prefer_not_to_say">Nie podano</option></select></label><label>Waga (kg)<input type="number" name="weight_kg" min={20} max={400} step="0.1" defaultValue={selectedAdminUser.profile?.weight_kg==null?'':String(selectedAdminUser.profile.weight_kg)}/></label><label>Wzrost (cm)<input type="number" name="height_cm" min={80} max={260} defaultValue={selectedAdminUser.profile?.height_cm==null?'':String(selectedAdminUser.profile.height_cm)}/></label><label>Miejsce treningu<select name="training_location" defaultValue={String(selectedAdminUser.profile?.training_location||'')}><option value="">Nie ustawiono</option><option value="gym">Siłownia</option><option value="home">Dom</option><option value="both">Oba</option></select></label><label>Cel treningowy<select name="primary_goal" defaultValue={String(selectedAdminUser.profile?.primary_goal||'')}><option value="">Nie ustawiono</option><option value="muscle">Budowa mięśni</option><option value="fat_loss">Redukcja tkanki tłuszczowej</option><option value="strength">Siła</option><option value="consistency">Regularność</option><option value="health">Zdrowie</option></select></label><label>Treningi w tygodniu<input type="number" name="training_days_per_week" min={1} max={7} step={1} defaultValue={selectedAdminUser.profile?.training_days_per_week==null?'':String(selectedAdminUser.profile.training_days_per_week)}/></label></div><button className="sf-button sf-button-lime">Zapisz profil</button></form><hr/><h3>Administracja kontem</h3><form className="sf-form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const password=String(f.get('new_password')||'');try{await api(`/api/v2/admin/users/${encodeURIComponent(String(selectedAdminUser.user.id))}`,{method:'PATCH',body:JSON.stringify({email:String(f.get('email')||''),new_password:password})});notify('Dane konta zapisane. Jeśli zmieniono hasło, użytkownik musi zalogować się ponownie.','success');await inspectAdminUser(String(selectedAdminUser.user.id));}catch(err){notify(err instanceof Error?err.message:'Nie udało się zapisać konta.','error');}}}><label>E-mail użytkownika<input type="email" name="email" required defaultValue={String(selectedAdminUser.user.email||'')}/></label><label>Ustaw nowe hasło (opcjonalnie)<input type="password" name="new_password" minLength={8} maxLength={128} autoComplete="new-password"/><small className="sf-muted">8–128 znaków, wielka i mała litera, cyfra i znak specjalny.</small></label><button className="sf-button sf-button-lime">Zapisz konto</button></form><form className="sf-form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/v2/admin/users/${encodeURIComponent(String(selectedAdminUser.user.id))}/access`,{method:'POST',body:JSON.stringify({product_key:String(f.get('product_key')||''),active:true})});notify('Dostęp do materiału nadany.','success');await inspectAdminUser(String(selectedAdminUser.user.id));}catch(err){notify(err instanceof Error?err.message:'Nie udało się nadać dostępu.','error');}}}><h4>Nadaj dostęp do materiału</h4><label>Produkt<select name="product_key" required defaultValue=""><option value="">Wybierz materiał</option>{adminProducts.map(p=><option key={p.product_key} value={p.product_key}>{p.title}</option>)}</select></label><button className="sf-button sf-button-outline">Nadaj dostęp</button></form><button className="sf-button sf-button-danger" onClick={async()=>{if(!window.confirm('Usunąć konto użytkownika wraz z powiązanymi danymi? Tej operacji nie można cofnąć.'))return;try{await api(`/api/v2/admin/users/${encodeURIComponent(String(selectedAdminUser.user.id))}`,{method:'DELETE'});setSelectedAdminUser(null);const r=await api<{users:typeof adminUsers}>('/api/v2/admin/users');setAdminUsers(r.users||[]);notify('Konto użytkownika usunięte.','success');}catch(err){notify(err instanceof Error?err.message:'Nie udało się usunąć konta.','error');}}}>Usuń konto użytkownika</button></div>}</div></div>}
{ManualAccessForm({ products: adminProducts })}</section>
    : path.startsWith('/acp/platnosci') ? <section className="sf-view">{PageTitle({ eyebrow: 'STRIPE / DIAGNOSTYKA', title: 'Płatności i webhooki.', subtitle: 'Zdarzenia są prezentowane bez kluczy API i bez danych karty płatniczej.' })}<div className="sf-two-col"><div className="sf-panel"><h3>Ostatnie zdarzenia webhooka</h3>{payments.events.length ? payments.events.map((e,i)=><div className="sf-list-row" key={String(e.event_id || i)}><span className="sf-list-icon"><ShieldCheck size={16}/></span><span className="sf-list-main"><b>{String(e.event_type)} · {String(e.status || 'processed')}</b><small>{String(e.event_id)} · {dateLabel(String(e.received_at))}</small>{Boolean(e.error_message) && <small className="sf-error-text">{String(e.error_message)}</small>}{Boolean(e.checkout_session_id) && <small>Checkout: {String(e.checkout_session_id)}</small>}</span></div>) : <p className="sf-muted">Brak zapisanych zdarzeń.</p>}</div><div className="sf-panel"><h3>Zamówienia wymagające uwagi</h3>{payments.attention_orders.length ? payments.attention_orders.map(o=><div className="sf-list-row" key={o.id}><span className="sf-list-main"><b>{o.display_order_number || o.order_number}</b><small>{orderStatusLabel(o.status)} · {dateLabel(o.created_at)}</small></span><strong>{money(o.total_amount,o.currency)}</strong></div>) : <p className="sf-muted">Brak zamówień w statusach oczekujących, anulowanych lub zwróconych.</p>}</div></div></section>
    : path.startsWith('/acp/statystyki') ? <section className="sf-view">{PageTitle({ eyebrow: 'ANALITYKA', title: 'Dane sklepu.', subtitle: 'Raport obejmuje dobrowolnie zebrane zdarzenia oraz zapisane zamówienia. Przychód pochodzi z zamówień potwierdzonych.' })}<div className="sf-stat-grid">{(Array.isArray(analytics.events) ? analytics.events as Array<{event_type:string;count:number}> : []).map(x=><div className="sf-stat-card" key={x.event_type}><span className="sf-stat-icon"><BarChart3/></span><small>{x.event_type.replaceAll('_',' ').toUpperCase()}</small><b>{x.count}</b><span className="sf-muted">Ostatnie 30 dni</span></div>)}</div><div className="sf-two-col"><section className="sf-panel"><h3>Popularne produkty</h3>{Array.isArray(analytics.popular_products) && (analytics.popular_products as Array<{product_key:string;views:number}>).length ? (analytics.popular_products as Array<{product_key:string;views:number}>).map(p=><div className="sf-list-row" key={p.product_key}><span className="sf-list-main"><b>{adminProducts.find(x=>x.product_key===p.product_key)?.title || p.product_key}</b></span><strong>{p.views} odsłon</strong></div>) : <p className="sf-muted">Brak danych o odsłonach.</p>}</section><section className="sf-panel"><h3>Lejek</h3><p>Odwiedzający produkty: <b>{String((analytics.funnel as Record<string,unknown> | undefined)?.product_visitors ?? 0)}</b></p><p>Rozpoczęte zakupy: <b>{String((analytics.funnel as Record<string,unknown> | undefined)?.checkout_starts ?? 0)}</b></p><p>Potwierdzenia zarejestrowane w analityce: <b>{String((analytics.funnel as Record<string,unknown> | undefined)?.confirmations ?? 0)}</b></p><small className="sf-muted">To zdarzenia analityczne; przychód nie jest liczony z kliknięć.</small></section></div></section>
    : path.startsWith('/acp/promocje') ? <section className="sf-view">{PageTitle({ eyebrow: 'KODY RABATOWE', title: 'Promocje.', subtitle: 'Rabat jest obliczany na serwerze i uwzględniany w oczekiwanej kwocie sesji Stripe.' })}<div className="sf-two-col"><form className="sf-panel sf-form-stack" onSubmit={createPromo}><h3>Utwórz kod</h3><label>Kod<input required minLength={3} maxLength={80} value={promoForm.code} onChange={e => setPromoForm(v => ({...v,code:e.target.value.toUpperCase()}))} placeholder="FORMA10"/></label><div className="sf-form-grid"><label>Rodzaj<select value={promoForm.discount_type} onChange={e => setPromoForm(v => ({...v,discount_type:e.target.value}))}><option value="percent">Procent (%)</option><option value="fixed">Kwota (PLN)</option></select></label><label>Wartość<input type="number" required min="0.01" max={promoForm.discount_type === 'percent' ? 100 : 100000} step="any" value={promoForm.discount_value} onChange={e => setPromoForm(v => ({...v,discount_value:e.target.value}))}/></label></div><label>Produkt (opcjonalnie)<select value={promoForm.product_key} onChange={e => setPromoForm(v => ({...v,product_key:e.target.value}))}><option value="">Dowolny płatny produkt</option>{adminProducts.map(p=><option key={p.product_key} value={p.product_key}>{p.title}</option>)}</select></label><div className="sf-form-grid"><label>Aktywny od<input type="datetime-local" value={promoForm.starts_at} onChange={e => setPromoForm(v => ({...v,starts_at:e.target.value}))}/></label><label>Ważny do<input type="datetime-local" value={promoForm.ends_at} onChange={e => setPromoForm(v => ({...v,ends_at:e.target.value}))}/></label></div><label>Limit użyć (opcjonalnie)<input type="number" min="1" value={promoForm.max_uses} onChange={e => setPromoForm(v => ({...v,max_uses:e.target.value}))}/></label><button className="sf-button sf-button-lime"><Plus size={15}/> Utwórz kod</button></form><section className="sf-panel"><h3>Utworzone kody</h3>{promos.length ? promos.map(p=><div className="sf-promo-row" key={p.id}><span><b>{p.code}</b><small>{p.discount_type === 'percent' ? `${p.discount_value}%` : money(p.discount_value)} · użyto {p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</small></span><button className={`sf-status-button ${p.is_active ? 'is-active' : ''}`} onClick={async()=>{await api(`/api/v2/admin/promotions/${p.id}`,{method:'PATCH',body:JSON.stringify({is_active:!p.is_active})});setPromos(old=>old.map(x=>x.id===p.id?{...x,is_active:p.is_active?0:1}:x));}}>{p.is_active?'Aktywny':'Wyłączony'}</button></div>) : <p className="sf-muted">Nie utworzono kodów rabatowych.</p>}</section></div></section>
    : path.startsWith('/acp/plany-indywidualne') ? <section className="sf-view">{PageTitle({ eyebrow: 'REALIZACJA USŁUG', title: 'Zamówienia planów indywidualnych.', subtitle: 'Każde zamówienie ma osobny status i własny plan przypisany do konta klienta. Zapisz plan w edytorze, a dopiero potem ustaw status „Zrealizowany”. E-mail wysyłasz samodzielnie poza aplikacją.' })}{individualPlanOrders.length ? <div className="sf-ticket-grid sf-individual-orders">{individualPlanOrders.map(request => { const draft = individualPlanDrafts[request.id] || individualPlanDraftFromRequest(request); const questionnaire = parseIndividualQuestionnaire(request.questionnaire_json); const updateDraft = (patch: Partial<IndividualPlanDraft>) => setIndividualPlanDrafts(old => ({ ...old, [request.id]: { ...draft, ...patch } })); return <article className="sf-panel sf-ticket" key={request.id}><div className="sf-panel-heading"><span className={`sf-status sf-status-${request.status}`}>{individualPlanStatusLabel(request.status, request.payment_status)}</span><small>{dateLabel(request.created_at)}</small></div><h3>{request.full_name || 'Klient'} · {request.email}</h3><p className="sf-muted">Zamówienie: {request.display_order_number || request.order_id || '—'} · {request.payment_status === 'legacy' ? 'Starsze zgłoszenie' : 'Płatność potwierdzona · 149,99 zł'}</p><p className="sf-muted">Cel: {({muscle:'Budowa mięśni',strength:'Zwiększenie siły',fat_loss:'Redukcja',general:'Ogólna sprawność'} as Record<string,string>)[request.goal] || request.goal} · {request.level} · {request.location} · {request.days_per_week} dni/tydz. · {request.session_minutes} min</p><div className="sf-individual-answer-grid"><div><b>Sprzęt</b><p>{individualEquipmentLabel(request.equipment, questionnaire.equipment_other)}</p></div><div><b>Dane podstawowe</b><p>{questionnaireValue(questionnaire,'age')} lat · {({female:'Kobieta',male:'Mężczyzna',other:'Inna',prefer_not_to_say:'Nie podano'} as Record<string,string>)[questionnaire.sex] || 'Nie podano'} · {questionnaireValue(questionnaire,'weight_kg')} kg · {questionnaireValue(questionnaire,'height_cm')} cm</p></div><div><b>Choroby / stan zdrowia</b><p>{questionnaireValue(questionnaire,'illnesses')}</p></div><div><b>Kontuzje</b><p>{questionnaireValue(questionnaire,'injuries')}</p></div><div><b>Wady wrodzone / ograniczenia</b><p>{questionnaireValue(questionnaire,'congenital_conditions')}</p></div><div><b>Leki</b><p>{questionnaireValue(questionnaire,'medications')}</p></div><div><b>Maksima — {questionnaire.max_profile==='home'?'dom':'siłownia'}</b><p>{questionnaire.max_profile==='home' ? `Pompki: ${maximumLabel(questionnaire,'max_pushups','max_pushups_unknown','powt.')}; pompki na kolanach: ${maximumLabel(questionnaire,'max_knee_pushups','max_knee_pushups_unknown','powt.')}; przysiady: ${maximumLabel(questionnaire,'max_squat_bodyweight','max_squat_bodyweight_unknown','powt.')}; brzuszki: ${maximumLabel(questionnaire,'max_situps','max_situps_unknown','powt.')}; pajacyki: ${maximumLabel(questionnaire,'max_jumping_jacks','max_jumping_jacks_unknown','powt.')}` : `Wyciskanie: ${maximumLabel(questionnaire,'max_bench_press','max_bench_press_unknown','kg')}; przysiad: ${maximumLabel(questionnaire,'max_squat','max_squat_unknown','kg')}; brzuszki: ${maximumLabel(questionnaire,'max_situps','max_situps_unknown','powt.')}; martwy ciąg: ${maximumLabel(questionnaire,'max_deadlift','max_deadlift_unknown','kg')}`}</p></div><div><b>Progresja i samoocena</b><p>{questionnaireValue(questionnaire,'progression')} · kondycja {questionnaireValue(questionnaire,'conditioning_rating')}/10 · siła {questionnaireValue(questionnaire,'strength_rating')}/10</p></div><div><b>Doświadczenie</b><p>{request.training_history || 'Nie podano'}</p></div><div><b>Harmonogram</b><p>{request.schedule || 'Nie podano'}</p></div><div><b>Ćwiczenia lubiane</b><p>{request.preferences || 'Nie podano'}</p></div><div><b>Ćwiczenia nielubiane</b><p>{request.avoid || 'Nie podano'}</p></div><div><b>Ćwiczenia niewskazane</b><p>{questionnaireValue(questionnaire,'unable_exercises')}</p></div><div><b>Dodatkowe informacje</b><p>{request.notes || 'Nie podano'}</p></div></div><label>Status realizacji<select value={request.status} onChange={e => setIndividualPlanOrders(old => old.map(x => x.id === request.id ? { ...x, status: e.target.value } : x))}><option value="awaiting_questionnaire">Zapłacony</option><option value="in_preparation">Realizowany</option><option value="ready">Zrealizowany</option><option value="canceled">Anulowane</option><option value="refunded">Zwrócono płatność</option></select></label><label>Notatka administratora<textarea value={request.admin_note || ''} maxLength={4000} rows={3} onChange={e => setIndividualPlanOrders(old => old.map(x => x.id === request.id ? { ...x, admin_note: e.target.value } : x))}/></label><button className="sf-button sf-button-lime" onClick={() => void saveIndividualPlanRequestAdmin(request, request.status)}>Zapisz status i notatkę <Check size={15}/></button><hr/><h3>{request.training_plan_id ? 'Edytuj przypisany plan' : 'Utwórz plan dla tego zamówienia'}</h3><p className="sf-muted">Ćwiczenia zostaną zapisane w aplikacji przypisanej do tego klienta. Plan nie będzie widoczny dla niego, dopóki nie ustawisz statusu „Zrealizowany”.</p><div className="sf-form-stack"><label>Nazwa planu<input value={draft.name} maxLength={120} onChange={e => updateDraft({ name: e.target.value })}/></label><label>Opis planu<textarea value={draft.description} maxLength={1000} rows={2} onChange={e => updateDraft({ description: e.target.value })}/></label><div className="sf-two-col"><label>Data rozpoczęcia<input type="date" value={draft.start_date} onChange={e => updateDraft({ start_date: e.target.value })}/></label><label>Strategia progresji<select value={draft.progression_strategy} onChange={e => updateDraft({ progression_strategy: e.target.value as ProgressionStrategy })}><option value="reps">Najpierw zwiększaj powtórzenia</option><option value="weight">Najpierw zwiększaj ciężar</option><option value="sets">Najpierw zwiększaj serie</option><option value="none">Bez automatycznej progresji</option></select></label></div><label>Plan treningowy — dni i ćwiczenia<textarea value={draft.plan_text} rows={12} spellCheck={false} onChange={e => updateDraft({ plan_text: e.target.value })}/></label><small className="sf-muted">Format: nagłówek dnia w osobnej linii, np. [Dzień A: Klatka + triceps]. Każde ćwiczenie w osobnej linii w formacie: nazwa; serie; powtórzenia; przerwa w sekundach; uwagi; ciężar w kg. Ostatnie dwa pola są opcjonalne. Dni oddzielaj pustą linią. Maksymalnie 7 dni i 40 ćwiczeń na dzień.</small><button className="sf-button sf-button-outline" onClick={() => void saveIndividualTrainingPlanAdmin(request)}><Check size={15}/> Zapisz plan i przypisz go do konta</button>{request.training_plan_id && <p className="sf-muted">Plan przypisany · {request.training_plan_name || draft.name} · ID: {request.training_plan_id}</p>}</div></article>; })}</div> : <div className="sf-empty"><ClipboardList size={28}/><h3>Brak zamówień planów indywidualnych</h3><p>Gdy użytkownik opłaci formularz, jego zgłoszenie pojawi się tutaj.</p></div>}</section>
    : path.startsWith('/acp/pomoc') ? <section className="sf-view">{PageTitle({ eyebrow: 'OBSŁUGA KLIENTA', title: 'Zgłoszenia pomocy.', subtitle: 'Zgłoszenia użytkowników są przechowywane w bazie i mają status obsługi.' })}{adminTickets.length ? <div className="sf-ticket-grid">{adminTickets.map(t=><article className="sf-panel sf-ticket" key={t.id}><div className="sf-panel-heading"><span className="sf-status">{t.status}</span><small>{dateLabel(t.created_at)}</small></div><h3>{t.subject}</h3><p className="sf-muted">{t.email} · {t.topic}</p><p>{t.message}</p>{t.admin_note && <div className="sf-info-note">{t.admin_note}</div>}<label>Notatka administratora<textarea defaultValue={t.admin_note || ''} onChange={e => setAdminTickets(old=>old.map(x=>x.id===t.id?{...x,admin_note:e.target.value}:x))}/></label><div className="sf-button-row"><button className="sf-button sf-button-outline" onClick={()=>void saveTicket(t,'in_progress')}>W trakcie</button><button className="sf-button sf-button-lime" onClick={()=>void saveTicket(t,'resolved')}>Rozwiąż</button><button className="sf-button sf-button-outline" onClick={()=>void saveTicket(t,'closed')}>Zamknij</button></div></article>)}</div> : <div className="sf-empty"><LifeBuoy size={28}/><h3>Brak zgłoszeń</h3><p>Nowe wiadomości pojawią się po wysłaniu formularza przez użytkownika.</p></div>}</section>
    : path.startsWith('/acp/ustawienia') ? <section className="sf-view">{PageTitle({ eyebrow: 'KONFIGURACJA', title: 'Ustawienia platformy.', subtitle: 'Te ustawienia nie zawierają kluczy Stripe ani innych sekretów. Sekrety pozostają w konfiguracji Cloudflare.' })}<form className="sf-panel sf-form-stack" onSubmit={saveSettings}><label>E-mail obsługi<input type="email" maxLength={254} value={settings.support_email} onChange={e => setSettings(v=>({...v,support_email:e.target.value}))}/></label><label>Komunikat w sklepie<textarea maxLength={1000} rows={3} value={settings.store_notice} onChange={e => setSettings(v=>({...v,store_notice:e.target.value}))}/></label><label className="sf-check"><input type="checkbox" checked={settings.analytics_enabled === 'true'} onChange={e=>setSettings(v=>({...v,analytics_enabled:e.target.checked?'true':'false'}))}/> Zezwalaj na analitykę po uzyskaniu zgody użytkownika</label><hr/><h3>Blokada witryny hasłem</h3><label className="sf-check"><input type="checkbox" checked={settings.site_lock_enabled === 'true'} onChange={e=>setSettings(v=>({...v,site_lock_enabled:e.target.checked?'true':'false'}))}/> Włącz blokadę witryny</label><label>Nowe hasło do blokady (8–200 znaków)<input type="password" minLength={8} maxLength={200} autoComplete="new-password" value={settings.site_lock_password} onChange={e=>setSettings(v=>({...v,site_lock_password:e.target.value}))}/></label><button type="button" className="sf-button sf-button-outline" onClick={() => void setSiteLockPassword()}>Ustaw hasło blokady</button><small className="sf-muted">Hasło zapisuje się osobnym żądaniem. Po zapisaniu blokada witryny zostanie włączona. Puste pole nie usuwa ani nie zmienia obecnego hasła.</small><h3>Tryb konserwacji</h3><label>Komunikat na ekranie blokady<textarea maxLength={1000} rows={3} value={settings.maintenance_message} onChange={e=>setSettings(v=>({...v,maintenance_message:e.target.value}))}/></label><label>Planowane zakończenie (opcjonalnie)<input type="datetime-local" value={settings.maintenance_until} onChange={e=>setSettings(v=>({...v,maintenance_until:e.target.value}))}/></label><small className="sf-muted">Termin jest informacyjny — blokada nie wyłączy się automatycznie. Administrator nadal może wejść do ACP przez przycisk na ekranie blokady.</small><button className="sf-button sf-button-lime">Zapisz ustawienia <Check size={16}/></button></form></section> : <div className="sf-empty"><Settings size={30}/><h3>Nie znaleziono sekcji ACP</h3><button className="sf-button sf-button-lime" onClick={() => go('/acp')}>Wróć do pulpitu</button></div>}{menuOpen && <div className="sf-dropdown sf-app-dropdown sf-acp-dropdown">{nav.map(n => <button key={n.href} onClick={() => go(n.href)}>{n.label}</button>)}<button onClick={() => go('/app')}><ArrowLeft size={14}/> Aplikacja użytkownika</button><button onClick={() => go('/')}><Home size={14}/> Strona publiczna</button><button onClick={() => void signOut()}><LogOut size={14}/> Wyloguj</button></div>}</main><nav className="sf-mobile-nav sf-mobile-nav-admin" aria-label="Nawigacja ACP">{nav.slice(0,5).map(n=>{const Icon=n.icon;return <button key={n.href} className={path===n.href?'is-active':''} onClick={()=>go(n.href)} title={n.label} aria-label={n.label}><Icon size={20}/><span>{n.label}</span></button>})}</nav></div>;
  }
  function ManualAccessForm({ products: choices }: { products: AdminProduct[] }) { return <form className="sf-panel sf-form-stack" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);try{await api('/api/v2/admin/grant-access',{method:'POST',body:JSON.stringify({email:data.get('email'),product_key:data.get('product_key')})});e.currentTarget.reset();notify('Dostęp przypisany.','success');}catch(err){notify(err instanceof Error?err.message:'Nie udało się przypisać dostępu.','error');}}}><h3>Ręczne nadanie dostępu</h3><label>E-mail użytkownika<input type="email" name="email" required/></label><label>Produkt<select required name="product_key" defaultValue=""><option value="">Wybierz produkt</option>{choices.map(p=><option value={p.product_key} key={p.product_key}>{p.title}{p.is_free ? ' · bezpłatny' : ''}{!p.is_published ? ' · nieopublikowany' : ''}</option>)}</select></label><button className="sf-button sf-button-outline"><ShieldCheck size={15}/> Nadaj dostęp</button><small className="sf-muted">Operacja trafia do dziennika działań administracyjnych; nie tworzy fikcyjnej sprzedaży.</small></form>; }

  const showAdmin = path.startsWith('/acp');
  const showApp = privateRoute && authReady && Boolean(user);
  return <div className="sf-root">{!showApp && !showAdmin && Header()}{storeNotice && !showApp && !showAdmin && <div className="sf-store-notice" role="status">{storeNotice}</div>}{showAdmin ? (admin ? AdminLayout() : <main className="sf-container sf-empty"><ShieldCheck size={28}/><h2>Sprawdzam uprawnienia…</h2></main>) : showApp ? AppLayout() : PublicPage()}{notice && <div className={`sf-toast sf-toast-${notice.type}`} role="status"><span>{notice.type === 'success' ? <CheckCircle2 size={18}/> : notice.type === 'error' ? <X size={18}/> : <Activity size={18}/>}</span><p>{notice.text}</p><button aria-label="Zamknij komunikat" onClick={() => setNotice(null)}><X size={16}/></button></div>}{!consent && <div className="sf-consent"><div><b>Twoja prywatność ma znaczenie.</b><p>Opcjonalna analityka zapisuje zdarzenia korzystania ze sklepu; po zalogowaniu mogą być powiązane z kontem. Uruchamia się dopiero po zgodzie.</p></div><div><button className="sf-button sf-button-outline" onClick={() => {try{localStorage.setItem('sf-v2-analytics-consent','no')}catch{} setConsent('no');}}>Odrzuć</button><button className="sf-button sf-button-lime" onClick={() => {try{localStorage.setItem('sf-v2-analytics-consent','yes')}catch{} setConsent('yes');}}>Akceptuję analitykę</button></div></div>}{!showApp && !showAdmin && <footer className="sf-footer"><button className="sf-brand sf-footer-brand" onClick={() => go('/')}><img className="sf-brand-logo" src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="System Formy"/></button><p>Trening · Postępy · Materiały</p><div><button onClick={() => go('/regulamin')}>Regulamin</button><button onClick={() => go('/prywatnosc')}>Prywatność</button><button onClick={() => go('/pomoc')}>Pomoc</button></div><small>© {new Date().getFullYear()} System Formy</small></footer>}</div>;
}
