import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, BookOpen, CheckCircle2, ChevronRight,
  ClipboardList, Crown, Download, Dumbbell, FileText, Flame, KeyRound, LayoutDashboard,
  LockKeyhole, LogOut, Mail, Menu, Plus, Save, ShieldCheck, ShoppingBag, TrendingUp,
  Upload, UserRound, X,
} from 'lucide-react';

type User = { id: string; email: string };
type Profile = { first_name: string; gender: string; weight_kg: number | null; height_cm: number | null; training_location: string; primary_goal: string; training_days_per_week: number | null };
type Product = { id: string; product_key: string; title: string; description: string; product_type: string; price_amount: number; currency: string; is_free: number; is_published?: number; checkout_url?: string | null; original_filename?: string | null; created_at?: string };
type Entitlement = { id: string; product_key: string; product_title: string; product_type: string; access_status: string; created_at: string };
type Order = { id: string; order_number: string; status: string; total_amount: number; currency: string; created_at: string };
type Overview = { orders: Order[]; entitlements: Entitlement[]; planRequests: Array<{ id: string; status: string; created_at: string }> };
type Exercise = { name: string; sets: number; reps: number; weight_kg: number | null };
type Workout = { id: string; title: string; performed_on: string; notes: string; exercises_json: string; created_at: string };
type Checkin = { id: string; week_start: string; training_count: number; regularity: number; notes: string; created_at: string };
type PlanDay = { day_key: 'A' | 'B' | 'C'; title: string; exercises: Exercise[]; updated_at?: string };
type Tab = 'home' | 'profile' | 'orders' | 'materials' | 'plan' | 'training' | 'progress' | 'premium' | 'admin';
type Notice = { message: string; kind: 'success' | 'error' | 'info' };

const LOGO = '/2F1E20BF-50D5-450A-99FB-4408BA767302.png';
const emptyProfile = (): Profile => ({ first_name: '', gender: '', weight_kg: null, height_cm: null, training_location: '', primary_goal: '', training_days_per_week: null });
const passwordRules = (v: string) => [
  ['Minimum 8 znaków', v.length >= 8], ['Wielka litera', /[A-Z]/.test(v)], ['Mała litera', /[a-z]/.test(v)],
  ['Cyfra', /[0-9]/.test(v)], ['Znak specjalny', /[^A-Za-z0-9\s]/.test(v)], ['Maksymalnie 128 znaków', v.length > 0 && v.length <= 128],
] as Array<[string, boolean]>;
const strongPassword = (v: string) => passwordRules(v).every((r) => r[1]);

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const multipart = typeof FormData !== 'undefined' && init.body instanceof FormData;
  headers.set('Accept', 'application/json');
  if (init.body && !multipart && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  let data: unknown = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Wystąpił błąd (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}
const formatDate = (value: string) => {
  const d = new Date(value + (value.length === 10 ? 'T12:00:00' : ''));
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(d);
};
const localDay = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const monday = (d: Date) => { const v = new Date(d.getFullYear(), d.getMonth(), d.getDate()); v.setDate(v.getDate() - ((v.getDay() + 6) % 7)); return localDay(v); };
const parseExercises = (v: string): Exercise[] => { try { const x: unknown = JSON.parse(v); return Array.isArray(x) ? x as Exercise[] : []; } catch { return []; } };
const productType = (v: string) => ({ ebook: 'E-book / PDF', training_plan: 'Plan treningowy', guide: 'Poradnik', bundle: 'Pakiet', other: 'Materiał cyfrowy' } as Record<string, string>)[v] ?? v;
const goalLabel = (v: string) => ({ muscle: 'Budowanie mięśni', fat_loss: 'Redukcja', strength: 'Większa siła', consistency: 'Regularność', health: 'Sprawność i zdrowie' } as Record<string, string>)[v] ?? 'Nie wybrano celu';
const locationLabel = (v: string) => ({ gym: 'Na siłowni', home: 'W domu', both: 'W domu i na siłowni' } as Record<string, string>)[v] ?? 'Nie wybrano miejsca';

const offerSections = [
  { n: '01', key: 'wyzwania', label: 'Wyzwania', heading: 'ZACZNIJ OD KONKRETU.', description: 'Jasny cel i określony czas zamiast przypadkowych treningów.', icon: Flame, items: ['Zbuduj nawyk', 'Trenuj w domu', 'Wejdź poziom wyżej'] },
  { n: '02', key: 'produkty', label: 'Produkty cyfrowe', heading: 'WIEDZA, DO KTÓREJ WRACASZ.', description: 'E-booki, poradniki i gotowe plany do samodzielnej pracy.', icon: BookOpen, items: ['E-booki treningowe', 'Poradniki', 'Gotowe plany'] },
  { n: '03', key: 'plan', label: 'Plan indywidualny', heading: 'PLAN DOPASOWANY DO CIEBIE.', description: 'Indywidualny plan i protokoły opracowane pod Twoją sytuację.', icon: ClipboardList, items: ['Indywidualny plan treningowy'] },
  { n: '04', key: 'prowadzenie', label: 'Prowadzenie online', heading: 'WSPÓŁPRACA, NIE TYLKO PLAN.', description: 'Wsparcie i monitoring procesu treningowego.', icon: Dumbbell, items: ['Prowadzenie online'] },
  { n: '05', key: 'program', label: 'Program Systemu Formy', heading: 'FLAGOWA OFERTA SYSTEMU FORMY.', description: 'Rozbudowany program dla osób, które chcą uporządkować cały proces.', icon: Crown, items: ['Program Systemu Formy'] },
  { n: '06', key: 'premium', label: 'Premium', heading: 'DODATKOWE MOŻLIWOŚCI.', description: 'Oddzielny dostęp do funkcji i materiałów objętych Premium.', icon: LockKeyhole, items: ['Dostęp Premium'] },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState('wyzwania');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [activePlanDay, setActivePlanDay] = useState<'A' | 'B' | 'C'>('A');
  const [planTitle, setPlanTitle] = useState('Dzień A');
  const [planExercises, setPlanExercises] = useState<Exercise[]>([{ name: '', sets: 3, reps: 10, weight_kg: null }]);
  const [planSaving, setPlanSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [workTitle, setWorkTitle] = useState('');
  const [workDate, setWorkDate] = useState(localDay(new Date()));
  const [workNotes, setWorkNotes] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([{ name: '', sets: 3, reps: 10, weight_kg: null }]);
  const [checkinCount, setCheckinCount] = useState('3');
  const [regularity, setRegularity] = useState('4');
  const [checkinNotes, setCheckinNotes] = useState('');
  const [adminError, setAdminError] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingGrant, setSavingGrant] = useState(false);
  const [savingProductSettings, setSavingProductSettings] = useState<string | null>(null);
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(null);

  function notify(message: string, kind: Notice['kind'] = 'info') { setNotice({ message, kind }); window.setTimeout(() => setNotice((old) => old?.message === message ? null : old), 6500); }
  function openAccount() { setAccountOpen(true); setAuthMode(currentUser ? 'login' : 'login'); setAuthError(''); setPassword(''); setPasswordAgain(''); setRememberMe(false); setActiveTab(currentUser ? 'home' : 'profile'); setMenuOpen(false); }
  function closeAccount() { setAccountOpen(false); setAuthError(''); setLegalPage(null); }

  async function loadProducts() {
    try { const r = await api<{ products: Product[] }>('/api/products'); setProducts(r.products ?? []); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się pobrać katalogu.', 'error'); }
  }
  async function loadDashboard() {
    if (!currentUser) return;
    setDashboardLoading(true);
    try {
      const [o, p, w, c, planResult] = await Promise.all([
        api<Overview>('/api/account/overview'), api<{ profile: Profile; has_profile?: boolean }>('/api/account/profile'),
        api<{ sessions: Workout[] }>('/api/training/sessions'), api<{ checkins: Checkin[] }>('/api/training/checkins'),
        api<{ days: PlanDay[] }>('/api/training/plan'),
      ]);
      setOverview(o); setProfile({ ...emptyProfile(), ...p.profile });
      const saved = Boolean(p.has_profile ?? (p.profile?.first_name || p.profile?.training_location || p.profile?.primary_goal || p.profile?.weight_kg !== null || p.profile?.height_cm !== null));
      setProfileSaved(saved); setProfileEditing(!saved); setWorkouts(w.sessions ?? []); setCheckins(c.checkins ?? []); setPlanDays((planResult.days ?? []).map((day) => ({ ...day, exercises: Array.isArray(day.exercises) ? day.exercises : [] })));
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się wczytać konta.', 'error'); }
    try { const a = await api<{ isAdmin: boolean }>('/api/admin/me'); setIsAdmin(Boolean(a.isAdmin)); } catch { setIsAdmin(false); }
    setDashboardLoading(false);
  }
  async function loadAdminProducts() {
    try { const r = await api<{ products: Product[] }>('/api/admin/products'); setAdminProducts(r.products ?? []); setAdminError(''); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Nie udało się pobrać produktów.'); }
  }
  useEffect(() => {
    let active = true;
    api<{ user: User | null }>('/api/auth/me').then((r) => { if (active && r.user) { setCurrentUser(r.user); setAccountOpen(false); } })
      .catch((e) => { if (active && e instanceof Error) notify(e.message, 'error'); })
      .finally(() => { if (active) setAuthReady(true); });
    void loadProducts();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (currentUser) void loadDashboard(); else { setOverview(null); setWorkouts([]); setCheckins([]); setPlanDays([]); setProfile(emptyProfile()); setProfileSaved(false); setProfileEditing(false); setIsAdmin(false); } }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser) return;
    let lastPing = Date.now();
    const onActivity = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastPing < 60_000) return;
      lastPing = now;
      void api<{ user: User | null }>('/api/auth/me').then((result) => {
        if (!result.user) {
          setCurrentUser(null);
          setAccountOpen(false);
          notify('Sesja wygasła. Zaloguj się ponownie.', 'info');
        }
      }).catch(() => {});
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
  }, [currentUser?.id]);
  useEffect(() => { if (activeTab === 'admin' && isAdmin) void loadAdminProducts(); }, [activeTab, isAdmin]);

  async function submitAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setAuthError('');
    try {
      if (authMode === 'signup') {
        if (password !== passwordAgain) throw new Error('Podane hasła nie są takie same.');
        if (!strongPassword(password)) throw new Error('Hasło musi mieć minimum 8 znaków, wielką i małą literę, cyfrę oraz znak specjalny.');
        const r = await api<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
        setCurrentUser(r.user); setAccountOpen(true); setActiveTab('home'); notify('Konto zostało utworzone.', 'success');
      } else if (authMode === 'login') {
        const r = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, rememberMe }) });
        setCurrentUser(r.user); setAccountOpen(true); setActiveTab('home'); setPassword(''); notify('Zalogowano pomyślnie.', 'success');
      } else {
        throw new Error('Odzyskiwanie hasła jest obecnie obsługiwane przez kontakt z administratorem.');
      }
    } catch (e) { const m = e instanceof Error ? e.message : 'Nie udało się zalogować.'; setAuthError(m); notify(m, 'error'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); setCurrentUser(null); setOverview(null); setAccountOpen(false); setAuthMode('login'); setRememberMe(false); setPassword(''); notify('Wylogowano.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się wylogować.', 'error'); }
    finally { setBusy(false); }
  }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setProfileSaving(true);
    try { const r = await api<{ profile: Profile }>('/api/account/profile', { method: 'PUT', body: JSON.stringify(profile) }); setProfile({ ...emptyProfile(), ...r.profile }); setProfileSaved(true); setProfileEditing(false); notify('Dane profilu zostały zapisane.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać profilu.', 'error'); }
    finally { setProfileSaving(false); }
  }
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (newPassword !== newPasswordAgain) { notify('Nowe hasła nie są takie same.', 'error'); return; }
    if (!strongPassword(newPassword)) { notify('Nowe hasło nie spełnia wymagań bezpieczeństwa.', 'error'); return; }
    setPasswordSaving(true);
    try { await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentUser(null); setProfile(emptyProfile()); setProfileSaved(false); setCurrentPassword(''); setNewPassword(''); setNewPasswordAgain(''); setPassword(''); setAuthMode('login'); setActiveTab('profile'); notify('Hasło zmienione. Zaloguj się ponownie nowym hasłem.', 'success'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zmienić hasła.', 'error'); }
    finally { setPasswordSaving(false); }
  }
  async function claimProduct(product: Product) {
    if (!currentUser) { openAccount(); notify('Zaloguj się lub utwórz konto, aby przypisać darmowy materiał.', 'info'); return; }
    try { await api('/api/products/' + encodeURIComponent(product.product_key) + '/claim', { method: 'POST', body: '{}' }); notify('Materiał przypisany do konta. Pobieranie rozpocznie się za chwilę.', 'success'); window.location.assign('/api/products/' + encodeURIComponent(product.product_key) + '/download'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się odblokować produktu.', 'error'); }
  }
  useEffect(() => {
    const savedDay = planDays.find((day) => day.day_key === activePlanDay);
    setPlanTitle(savedDay?.title || `Dzień ${activePlanDay}`);
    setPlanExercises(savedDay?.exercises?.length ? savedDay.exercises.map((x) => ({ ...x, weight_kg: null })) : [{ name: '', sets: 3, reps: 10, weight_kg: null }]);
  }, [activePlanDay, planDays]);
  async function savePlanDay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const list = planExercises.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), sets: Number(x.sets), reps: Number(x.reps) }));
    if (!list.length) { notify('Dodaj co najmniej jedno ćwiczenie do planu.', 'error'); return; }
    setPlanSaving(true);
    try {
      await api('/api/training/plan', { method: 'PUT', body: JSON.stringify({ day_key: activePlanDay, title: planTitle, exercises: list }) });
      notify(`Plan dla dnia ${activePlanDay} został zapisany.`, 'success');
      await loadDashboard();
    } catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać planu.', 'error'); }
    finally { setPlanSaving(false); }
  }
  function usePlanForWorkout() {
    const savedDay = planDays.find((day) => day.day_key === activePlanDay);
    if (!savedDay?.exercises.length) { notify('Najpierw zapisz plan tego dnia.', 'error'); return; }
    setWorkTitle(`${savedDay.title || `Dzień ${activePlanDay}`} — trening`);
    setWorkDate(localDay(new Date()));
    setWorkNotes('Trening rozpoczęty na podstawie zapisanego planu. Uzupełnij rzeczywiste ciężary i wyniki.');
    setExercises(savedDay.exercises.map((x) => ({ name: x.name, sets: x.sets, reps: x.reps, weight_kg: null })));
    setActiveTab('training');
    notify('Plan przeniesiony do dziennika. Uzupełnij rzeczywiste ciężary i zapisz trening.', 'info');
  }
  function changePlanExercise(i: number, key: 'name' | 'sets' | 'reps', value: string) {
    setPlanExercises((old) => old.map((x, index) => index !== i ? x : { ...x, [key]: key === 'name' ? value : Number(value) }));
  }
  async function saveWorkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const list = exercises.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() }));
    if (!list.length) { notify('Dodaj przynajmniej jedno ćwiczenie.', 'error'); return; }
    setBusy(true);
    try { await api('/api/training/sessions', { method: 'POST', body: JSON.stringify({ title: workTitle, performed_on: workDate, notes: workNotes, exercises: list }) }); setWorkTitle(''); setWorkNotes(''); setExercises([{ name: '', sets: 3, reps: 10, weight_kg: null }]); notify('Trening zapisany.', 'success'); await loadDashboard(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać treningu.', 'error'); }
    finally { setBusy(false); }
  }
  async function saveCheckin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    try { await api('/api/training/checkins', { method: 'POST', body: JSON.stringify({ week_start: monday(new Date()), training_count: Number(checkinCount), regularity: Number(regularity), notes: checkinNotes }) }); setCheckinNotes(''); notify('Podsumowanie tygodnia zapisane.', 'success'); await loadDashboard(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Nie udało się zapisać podsumowania.', 'error'); }
    finally { setBusy(false); }
  }
  async function addProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSavingProduct(true); setAdminError('');
    try { const form = new FormData(e.currentTarget); await api('/api/admin/products', { method: 'POST', body: form }); e.currentTarget.reset(); notify('Produkt dodany do katalogu.', 'success'); await loadAdminProducts(); await loadProducts(); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Nie udało się dodać produktu.'); }
    finally { setSavingProduct(false); }
  }
  async function saveProductSettings(e: FormEvent<HTMLFormElement>, product: Product) {
    e.preventDefault(); setSavingProductSettings(product.product_key); setAdminError('');
    const form = new FormData(e.currentTarget);
    try {
      await api('/api/admin/products/' + encodeURIComponent(product.product_key), {
        method: 'PATCH',
        body: JSON.stringify({
          price_amount: Number(form.get('price_amount') || 0),
          is_free: form.get('is_free') === 'true',
          is_published: form.get('is_published') === 'true',
          checkout_url: String(form.get('checkout_url') || '').trim(),
        }),
      });
      notify('Ustawienia produktu zapisane.', 'success');
      await loadAdminProducts(); await loadProducts();
    } catch (e) { setAdminError(e instanceof Error ? e.message : 'Nie udało się zapisać ustawień produktu.'); }
    finally { setSavingProductSettings(null); }
  }
  async function grantAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSavingGrant(true); setAdminError(''); const form = new FormData(e.currentTarget);
    try { await api('/api/admin/grant-access', { method: 'POST', body: JSON.stringify({ email: String(form.get('email') || ''), product_key: String(form.get('product_key') || '') }) }); e.currentTarget.reset(); notify('Dostęp został przypisany po potwierdzeniu płatności.', 'success'); await loadDashboard(); await loadAdminProducts(); }
    catch (e) { setAdminError(e instanceof Error ? e.message : 'Nie udało się przypisać dostępu.'); }
    finally { setSavingGrant(false); }
  }
  function changeExercise(i: number, key: keyof Exercise, value: string) { setExercises((old) => old.map((x, index) => index !== i ? x : { ...x, [key]: key === 'name' ? value : value === '' && key === 'weight_kg' ? null : Number(value) })); }
  const owned = useMemo(() => (overview?.entitlements ?? []).filter((x) => x.access_status === 'active'), [overview]);
  const bars = useMemo(() => Array.from({ length: 4 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (3 - i) * 7); const start = localDay(d); const e = new Date(d); e.setDate(e.getDate() + 7); const end = localDay(e); return { label: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }), count: workouts.filter((x) => x.performed_on >= start && x.performed_on < end).length }; }), [workouts]);
  const maxBar = Math.max(1, ...bars.map((x) => x.count));

  const tabItems: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard }> = [
    { key: 'home', label: 'Centrum', icon: LayoutDashboard }, { key: 'profile', label: 'Moje dane', icon: UserRound },
    { key: 'orders', label: 'Zamówienia', icon: ShoppingBag }, { key: 'materials', label: 'Materiały', icon: BookOpen },
    { key: 'plan', label: 'Plan', icon: ClipboardList }, { key: 'training', label: 'Dziennik', icon: Dumbbell }, { key: 'progress', label: 'Postępy', icon: TrendingUp },
    { key: 'premium', label: 'Premium', icon: Crown }, ...(isAdmin ? [{ key: 'admin' as const, label: 'Administrator', icon: ShieldCheck }] : []),
  ];

  return <main className="site-shell" id="top">
    <header className="topbar"><a className="brand" href="#top"><img src={LOGO} alt="System Formy"/><span>TRENING <i>·</i> KONSEKWENCJA <i>·</i> PROGRES</span></a>
      <nav className="desktop-nav"><a href="#oferta">OFERTA</a><a href="#sklep">PRODUKTY</a><a href="#jak-dziala">JAK TO DZIAŁA</a></nav>
      <div className="header-actions"><button className="account-button" onClick={openAccount}><UserRound size={16}/>{currentUser ? 'MOJE KONTO' : 'ZALOGUJ SIĘ'}<ArrowUpRight size={15}/></button><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Otwórz menu">{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button></div>
      {menuOpen && <nav className="mobile-menu"><a href="#oferta" onClick={() => setMenuOpen(false)}>Oferta</a><a href="#sklep" onClick={() => setMenuOpen(false)}>Produkty</a><a href="#jak-dziala" onClick={() => setMenuOpen(false)}>Jak to działa</a><button onClick={openAccount}>Moje konto / logowanie</button></nav>}
    </header>
    <section className="hero"><div className="hero-content"><p className="eyebrow"><span/> TWOJA DROGA. TWÓJ SYSTEM.</p><h1>FORMA NIE ROBI SIĘ <span>SAMA.</span></h1><p className="hero-copy">Mniej chaosu. Więcej konsekwencji. Wybierz rozwiązanie, które pasuje do Twojego celu — od darmowego materiału po plan treningowy i dalszą współpracę.</p><a className="primary-button" href="#oferta">POZNAJ MOŻLIWOŚCI <ArrowUpRight size={17}/></a><p className="hero-footnote">JASNY KIERUNEK <i>·</i> REALNY PLAN <i>·</i> SYSTEMATYCZNOŚĆ</p></div><div className="hero-art"><div className="art-ring one"/><div className="art-ring two"/><img src={LOGO} alt=""/><span>BUILT WITH<br/>DISCIPLINE</span></div></section>
    <section className="offer-section" id="oferta"><div className="section-heading"><p className="eyebrow muted">SYSTEM FORMY / OFERTA</p><h2>JEDEN CEL. <span>WŁAŚCIWY NASTĘPNY KROK.</span></h2><p>Wybierz obszar, który najbardziej odpowiada Twoim aktualnym potrzebom.</p></div><div className="category-list">{offerSections.map((item) => { const Icon = item.icon; return <button key={item.key} className={category === item.key ? 'category is-active' : 'category'} onClick={() => setCategory(item.key)}><span>{item.n}</span><Icon size={18}/><strong>{item.label}</strong><ChevronRight size={16}/></button>; })}</div><div className="offer-detail"><p className="eyebrow muted">OBSZAR / {offerSections.find((x) => x.key === category)?.n}</p><h3>{offerSections.find((x) => x.key === category)?.heading}</h3><p>{offerSections.find((x) => x.key === category)?.description}</p><div className="offer-items">{offerSections.find((x) => x.key === category)?.items.map((item) => <div key={item}><CheckCircle2 size={16}/>{item}</div>)}</div><a className="text-link" href={category === 'produkty' ? '#sklep' : category === 'premium' ? '#sklep' : '#jak-dziala'}>{category === 'produkty' ? 'ZOBACZ PRODUKTY' : 'JAK TO DZIAŁA'} <ArrowRight size={15}/></a></div></section>
    <section className="journey-section" id="jak-dziala"><div><p className="eyebrow muted">PROCES SYSTEMU FORMY</p><h2>OD WYBORU<br/>DO <span>DZIAŁANIA.</span></h2><p>Produkty, historia zamówień, plan treningowy i postępy — w jednej strefie klienta.</p></div><div className="journey-steps"><div><span>01</span><section><h3>Wybierasz materiał</h3><p>Bezpłatny e-book lub płatny produkt z katalogu.</p></section><ChevronRight size={18}/></div><div><span>02</span><section><h3>Otrzymujesz dostęp</h3><p>Darmowy plik odblokujesz na koncie; płatny po potwierdzeniu zakupu.</p></section><ChevronRight size={18}/></div><div><span>03</span><section><h3>Realizujesz plan</h3><p>Zapisujesz treningi, wyniki i cotygodniowe podsumowania.</p></section><ChevronRight size={18}/></div></div></section>
    <section className="store-section" id="sklep"><div className="section-heading"><p className="eyebrow muted">SYSTEM FORMY / KATALOG</p><h2>WYBIERZ SWÓJ <span>MATERIAŁ.</span></h2><p>E-booki, poradniki i plany. Produkty, które opublikujesz w panelu administratora, pojawią się tutaj automatycznie.</p></div>
      {products.length === 0 ? <p className="empty-catalog">Katalog jest gotowy na Twoje produkty. Dodasz je z poziomu konta administratora.</p> : <div className="product-grid">{products.map((p) => <article className="product-card" key={p.id}><div className="product-icon">{p.is_free ? <BookOpen size={22}/> : <FileText size={22}/>}</div><p className="eyebrow muted">{productType(p.product_type)}</p><h3>{p.title}</h3><p>{p.description}</p><div className="product-bottom"><strong>{p.is_free ? 'BEZPŁATNIE' : new Intl.NumberFormat('pl-PL', { style: 'currency', currency: p.currency || 'PLN' }).format(p.price_amount)}</strong>{owned.some((x) => x.product_key === p.product_key) ? <button className="outline-button" onClick={() => window.location.assign('/api/products/' + encodeURIComponent(p.product_key) + '/download')}><Download size={15}/> Pobierz</button> : p.is_free ? <button className="outline-button" onClick={() => void claimProduct(p)}><ArrowDownToLine size={15}/> Pobierz za darmo</button> : p.checkout_url ? <a className="solid-button" href={p.checkout_url} target="_blank" rel="noreferrer">Przejdź do zakupu <ArrowUpRight size={15}/></a> : <span className="coming-soon">WKRÓTCE</span>}</div></article>)}</div>}
    </section>
    <section className="closing-cta"><div><p className="eyebrow"><span/> ZACZNIJ OD DOBREGO WYBORU</p><h2>TWÓJ SYSTEM.<br/><span>TWOJE TEMPO.</span></h2></div><button className="secondary-button" onClick={openAccount}>OTWÓRZ STREFĘ KLIENTA <ArrowUpRight size={16}/></button></section>
    <footer className="footer"><a className="brand" href="#top"><img src={LOGO} alt="System Formy"/><span>TRENING · KONSEKWENCJA · PROGRES</span></a><p>RUSZAJ. BUDUJ. POWTARZAJ.</p><nav><button onClick={() => setLegalPage('terms')}>Regulamin</button><span>·</span><button onClick={() => setLegalPage('privacy')}>Polityka prywatności</button></nav><small>© {new Date().getFullYear()} SYSTEM FORMY</small></footer>

    {accountOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAccount(); }}><section className="account-modal" role="dialog" aria-modal="true" aria-label="Strefa klienta"><button className="modal-close" onClick={closeAccount} aria-label="Zamknij"><X size={20}/></button>
      {!currentUser ? <><div className="auth-heading"><p className="eyebrow muted">SYSTEM FORMY / KONTO</p><h2>{authMode === 'signup' ? 'UTWÓRZ KONTO.' : authMode === 'recovery' ? 'ODZYSKAJ DOSTĘP.' : 'DOBRZE CIĘ WIDZIEĆ.'}</h2><p>{authMode === 'signup' ? 'Załóż konto, aby zapisywać materiały i treningi.' : authMode === 'recovery' ? 'W celu odzyskania dostępu napisz do administratora konta.' : 'Zaloguj się, aby otworzyć swoją strefę klienta.'}</p></div>
        {authMode === 'recovery' ? <div className="auth-form"><p>Samodzielne odzyskiwanie hasła nie zostało jeszcze uruchomione. Skontaktuj się z administratorem z adresu przypisanego do konta.</p><a className="solid-button" href="mailto:jakub.gabriel2002@gmail.com?subject=System%20Formy%20%E2%80%94%20odzyskanie%20dost%C4%99pu">Napisz e-mail <Mail size={15}/></a><button className="quiet-button" onClick={() => setAuthMode('login')}>Wróć do logowania</button></div> : <form className="auth-form" onSubmit={(e) => void submitAuth(e)}><label>E-MAIL<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ty@przyklad.pl"/></label><label>HASŁO<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Hasło"/></label>
          {authMode === 'login' && <label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/><span><strong>Nie wylogowuj mnie</strong><small>Sesja do 7 dni; termin odnawia się przy korzystaniu ze strony.</small></span></label>}
          {authMode === 'signup' && <><div className="password-rules">{passwordRules(password).map(([label, ok]) => <span key={label} className={ok ? 'ok' : ''}><CheckCircle2 size={13}/>{label}</span>)}</div><label>POWTÓRZ HASŁO<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)}/></label></>}
          {authError && <p className="form-error" role="alert">{authError}</p>}<button className="solid-button full-width" disabled={busy || !authReady}>{busy ? 'CHWILA…' : authMode === 'login' ? 'ZALOGUJ SIĘ' : 'UTWÓRZ KONTO'} <ArrowUpRight size={16}/></button><div className="auth-links">{authMode === 'login' ? <><button type="button" onClick={() => setAuthMode('recovery')}>Nie pamiętam hasła</button><button type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Utwórz konto</button></> : <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Wróć do logowania</button>}</div><small className="privacy-note"><LockKeyhole size={13}/> Hasła są haszowane po stronie serwera, a sesję przechowuje ciasteczko HttpOnly.</small>
        </form>}
      </> : <><div className="account-heading"><div><p className="eyebrow muted">SYSTEM FORMY / STREFA KLIENTA</p><h2>TWOJE KONTO<span>.</span></h2><p>Zalogowano jako {currentUser.email}</p></div><button className="signout-button" disabled={busy} onClick={() => void signOut()}><LogOut size={15}/> WYLOGUJ</button></div>
        <div className="premium-near-logout"><Crown size={16}/><div><strong>System Formy Premium</strong><small>Dodatkowe możliwości i materiały dla użytkowników.</small></div><button onClick={() => setActiveTab('premium')}>Poznaj Premium</button></div>
        <nav className="account-tabs">{tabItems.map((t) => { const I = t.icon; return <button key={t.key} className={activeTab === t.key ? 'is-active' : ''} onClick={() => setActiveTab(t.key)}><I size={15}/>{t.label}</button>; })}</nav>
        {dashboardLoading ? <p className="loading-text">Ładowanie konta…</p> : <div className="account-content">
          {activeTab === 'home' && <><div className="dashboard-welcome"><p className="eyebrow muted">CENTRUM SYSTEMU FORMY</p><h3>TWÓJ SYSTEM. <span>TWOJE WYNIKI.</span></h3><p>Tu znajdziesz kupione materiały, treningi i historię postępów.</p></div><div className="stat-grid"><article><span>AKTYWNE MATERIAŁY</span><strong>{owned.length}</strong><small>Pliki dostępne na koncie</small></article><article><span>ZAPISANE TRENINGI</span><strong>{workouts.length}</strong><small>Sesje treningowe</small></article><article><span>ZAMÓWIENIA</span><strong>{overview?.orders.length ?? 0}</strong><small>Historia zakupów</small></article></div><div className="content-card"><h3>NAJBLIŻSZY KROK</h3><p>Dodaj trening i zapisz ćwiczenia, serie, powtórzenia oraz ciężary. Materiały pobierzesz z zakładki „Materiały”.</p><button className="outline-button" onClick={() => setActiveTab('training')}>Zapisz trening <ArrowRight size={15}/></button></div><div className="content-card"><h3>OSTATNIE TRENINGI</h3>{workouts.slice(0,3).map((w) => <div className="list-row" key={w.id}><div><strong>{w.title}</strong><small>{formatDate(w.performed_on)}</small></div><span>{parseExercises(w.exercises_json).length} ćwiczeń</span></div>)}{workouts.length === 0 && <p className="muted-text">Nie ma jeszcze zapisanych treningów.</p>}</div></>}
          {activeTab === 'profile' && <><div className="content-heading"><div><p className="eyebrow muted">DANE I PREFERENCJE</p><h3>MOJE DANE</h3></div><p>Adres konta: <strong>{currentUser.email}</strong></p></div>{profileSaved && !profileEditing ? <div className="saved-profile"><div><p className="eyebrow muted">PROFIL ZAPISANY</p><h3>{profile.first_name || 'Twój profil'}</h3><p>{locationLabel(profile.training_location)} · {goalLabel(profile.primary_goal)}</p><small>Waga: {profile.weight_kg ?? '—'} kg · Wzrost: {profile.height_cm ?? '—'} cm · Treningi w tygodniu: {profile.training_days_per_week ?? '—'}</small></div><button className="profile-update-button" onClick={() => setProfileEditing(true)}><Save size={15}/> Zaktualizuj dane</button></div> : <form className="form-grid" onSubmit={(e) => void saveProfile(e)}><label>IMIĘ<input value={profile.first_name} maxLength={80} onChange={(e) => setProfile((x) => ({ ...x, first_name: e.target.value }))} placeholder="Jak mamy się do Ciebie zwracać?"/></label><label>PŁEĆ (OPCJONALNIE)<select value={profile.gender} onChange={(e) => setProfile((x) => ({ ...x, gender: e.target.value }))}><option value="">Nie podano</option><option value="female">Kobieta</option><option value="male">Mężczyzna</option><option value="other">Inna / wolę opisać inaczej</option><option value="prefer_not_to_say">Wolę nie podawać</option></select></label><label>WAGA (KG)<input type="number" min="20" max="400" step="0.1" value={profile.weight_kg ?? ''} onChange={(e) => setProfile((x) => ({ ...x, weight_kg: e.target.value === '' ? null : Number(e.target.value) }))}/></label><label>WZROST (CM)<input type="number" min="80" max="260" value={profile.height_cm ?? ''} onChange={(e) => setProfile((x) => ({ ...x, height_cm: e.target.value === '' ? null : Number(e.target.value) }))}/></label><label>GDZIE TRENUJESZ?<select value={profile.training_location} onChange={(e) => setProfile((x) => ({ ...x, training_location: e.target.value }))}><option value="">Wybierz miejsce</option><option value="gym">Na siłowni</option><option value="home">W domu</option><option value="both">W obu miejscach</option></select></label><label>GŁÓWNY CEL<select value={profile.primary_goal} onChange={(e) => setProfile((x) => ({ ...x, primary_goal: e.target.value }))}><option value="">Wybierz cel</option><option value="muscle">Budowanie mięśni</option><option value="fat_loss">Redukcja</option><option value="strength">Zwiększenie siły</option><option value="consistency">Regularność i nawyki</option><option value="health">Ogólna sprawność</option></select></label><label>TRENINGI W TYGODNIU<select value={profile.training_days_per_week ?? ''} onChange={(e) => setProfile((x) => ({ ...x, training_days_per_week: e.target.value === '' ? null : Number(e.target.value) }))}><option value="">Nie określono</option>{[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><div className="form-submit-row"><small>Dane możesz później zmienić. Pola poza adresem e-mail są opcjonalne.</small><button className="solid-button" disabled={profileSaving}><Save size={15}/>{profileSaving ? 'ZAPISYWANIE…' : profileSaved ? 'ZAPISZ ZMIANY' : 'ZAPISZ DANE'}</button></div></form>}
            {profileSaved && profileEditing && <div className="edit-profile-overlay"><section className="edit-profile-modal"><button className="modal-close" onClick={() => setProfileEditing(false)}><X size={18}/></button><p className="eyebrow muted">EDYCJA PROFILU</p><h3>AKTUALIZUJ DANE.</h3><form className="form-grid" onSubmit={(e) => void saveProfile(e)}><label>IMIĘ<input value={profile.first_name} maxLength={80} onChange={(e) => setProfile((x) => ({ ...x, first_name: e.target.value }))}/></label><label>PŁEĆ<select value={profile.gender} onChange={(e) => setProfile((x) => ({ ...x, gender: e.target.value }))}><option value="">Nie podano</option><option value="female">Kobieta</option><option value="male">Mężczyzna</option><option value="other">Inna</option><option value="prefer_not_to_say">Wolę nie podawać</option></select></label><label>WAGA (KG)<input type="number" min="20" max="400" step="0.1" value={profile.weight_kg ?? ''} onChange={(e) => setProfile((x) => ({ ...x, weight_kg: e.target.value === '' ? null : Number(e.target.value) }))}/></label><label>WZROST (CM)<input type="number" min="80" max="260" value={profile.height_cm ?? ''} onChange={(e) => setProfile((x) => ({ ...x, height_cm: e.target.value === '' ? null : Number(e.target.value) }))}/></label><label>MIEJSCE TRENINGU<select value={profile.training_location} onChange={(e) => setProfile((x) => ({ ...x, training_location: e.target.value }))}><option value="">Wybierz</option><option value="gym">Siłownia</option><option value="home">Dom</option><option value="both">Oba</option></select></label><label>CEL<select value={profile.primary_goal} onChange={(e) => setProfile((x) => ({ ...x, primary_goal: e.target.value }))}><option value="">Wybierz</option><option value="muscle">Mięśnie</option><option value="fat_loss">Redukcja</option><option value="strength">Siła</option><option value="consistency">Regularność</option><option value="health">Zdrowie</option></select></label><label>TRENINGI W TYGODNIU<select value={profile.training_days_per_week ?? ''} onChange={(e) => setProfile((x) => ({ ...x, training_days_per_week: e.target.value === '' ? null : Number(e.target.value) }))}><option value="">Nie określono</option>{[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><div className="form-submit-row"><button type="button" className="quiet-button" onClick={() => setProfileEditing(false)}>Anuluj</button><button className="solid-button" disabled={profileSaving}><Save size={15}/>Zapisz zmiany</button></div></form></section></div>}
            <section className="content-card"><h3><KeyRound size={17}/> ZMIANA HASŁA</h3><p>Po zmianie hasła wszystkie sesje zostaną unieważnione i trzeba będzie zalogować się ponownie.</p><form className="form-grid" onSubmit={(e) => void changePassword(e)}><label>OBECNE HASŁO<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}/></label><label>NOWE HASŁO<input type="password" minLength={8} maxLength={128} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}/></label><label>POWTÓRZ NOWE HASŁO<input type="password" minLength={8} maxLength={128} required value={newPasswordAgain} onChange={(e) => setNewPasswordAgain(e.target.value)}/></label><div className="form-submit-row"><span className="password-rules">{passwordRules(newPassword).filter((x) => x[1]).length}/6 wymagań spełnionych</span><button className="solid-button" disabled={passwordSaving}>{passwordSaving ? 'ZMIENIANIE…' : 'ZMIEŃ HASŁO'} <KeyRound size={15}/></button></div></form></section>
          </>}
          {activeTab === 'orders' && <section className="content-card"><h3><ShoppingBag size={18}/> MOJE ZAMÓWIENIA</h3>{overview?.orders.length ? overview.orders.map((o) => <div className="list-row" key={o.id}><div><strong>{o.order_number}</strong><small>{formatDate(o.created_at)} · {o.status}</small></div><b>{new Intl.NumberFormat('pl-PL', { style: 'currency', currency: o.currency || 'PLN' }).format(o.total_amount)}</b></div>) : <p className="muted-text">Nie masz jeszcze zamówień.</p>}</section>}
          {activeTab === 'materials' && <section className="content-card"><h3><BookOpen size={18}/> MOJE MATERIAŁY</h3>{owned.length ? owned.map((x) => <div className="list-row" key={x.id}><div><strong>{x.product_title}</strong><small>{productType(x.product_type)} · odblokowano {formatDate(x.created_at)}</small></div><button className="outline-button" onClick={() => window.location.assign('/api/products/' + encodeURIComponent(x.product_key) + '/download')}><Download size={15}/> Pobierz</button></div>) : <p className="muted-text">Materiały pojawią się tutaj po pobraniu darmowego e-booka lub potwierdzeniu zakupu. Wróć do katalogu na stronie głównej, aby zobaczyć ofertę.</p>}</section>}
          {activeTab === 'plan' && <div className="plan-layout"><section className="content-card"><p className="eyebrow muted">TWÓJ PLAN</p><h3><ClipboardList size={18}/> DNI TRENINGOWE</h3><p className="muted-text">Ułóż własny plan A, B i C. Wpisz ćwiczenia, serie i docelowe powtórzenia. Plan jest prywatny i możesz wracać do niego później.</p><div className="plan-day-nav">{(['A', 'B', 'C'] as const).map((day) => { const saved = planDays.some((x) => x.day_key === day); return <button type="button" key={day} className={activePlanDay === day ? 'is-active' : ''} onClick={() => setActivePlanDay(day)}>Dzień {day}<small>{saved ? 'ZAPISANY' : 'PUSTY'}</small></button>; })}</div><div className="plan-preview-list">{planDays.filter((x) => x.day_key === activePlanDay).flatMap((x) => x.exercises).map((x, i) => <div key={i}><span>{x.name}</span><strong>{x.sets} × {x.reps}</strong></div>)}{!planDays.some((x) => x.day_key === activePlanDay) && <p className="muted-text">Ten dzień nie ma jeszcze zapisanego planu.</p>}</div></section><form className="content-card" onSubmit={(e) => void savePlanDay(e)}><p className="eyebrow muted">EDYCJA DNIA {activePlanDay}</p><h3>{`PLAN TRENINGOWY — DZIEŃ ${activePlanDay}`}</h3><label>NAZWA DNIA<input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} maxLength={120} required /></label><div className="exercise-heading"><strong>ĆWICZENIA / SERIE / POWTÓRZENIA</strong><button type="button" className="quiet-button" onClick={() => setPlanExercises((old) => [...old, { name: '', sets: 3, reps: 10, weight_kg: null }])}><Plus size={14}/> Dodaj</button></div>{planExercises.map((x, i) => <div className="exercise-fields plan-exercise-fields" key={i}><label>ĆWICZENIE<input value={x.name} onChange={(e) => changePlanExercise(i, 'name', e.target.value)} placeholder="np. Wyciskanie" maxLength={100}/></label><label>SERIE<input type="number" min="1" max="20" value={x.sets} onChange={(e) => changePlanExercise(i, 'sets', e.target.value)}/></label><label>POWTÓRZENIA<input type="number" min="1" max="100" value={x.reps} onChange={(e) => changePlanExercise(i, 'reps', e.target.value)}/></label>{planExercises.length > 1 && <button type="button" className="remove-exercise" onClick={() => setPlanExercises((old) => old.filter((_, j) => j !== i))} aria-label="Usuń ćwiczenie"><X size={13}/></button>}</div>)}<div className="plan-actions"><button className="solid-button" disabled={planSaving}>{planSaving ? 'ZAPISYWANIE…' : 'ZAPISZ PLAN DNIA'}</button><button type="button" className="outline-button" onClick={usePlanForWorkout}>PRZEJDŹ DO TRENINGU <ArrowRight size={15}/></button></div><p className="muted-text">Po przejściu do dziennika możesz wpisać rzeczywiste ciężary i zapisać wykonany trening. Wyniki trafią do historii progresu.</p></form></div>}
          {activeTab === 'training' && <div className="two-columns"><form className="content-card" onSubmit={(e) => void saveWorkout(e)}><h3><Dumbbell size={18}/> ZAPISZ TRENING</h3><label>NAZWA TRENINGU<input required maxLength={120} value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} placeholder="np. Dzień A"/></label><label>DATA<input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)}/></label><div className="exercise-heading"><strong>ĆWICZENIA</strong><button type="button" className="quiet-button" onClick={() => setExercises((x) => [...x, { name: '', sets: 3, reps: 10, weight_kg: null }])}><Plus size={14}/> Dodaj</button></div>{exercises.map((x, i) => <div className="exercise-fields" key={i}><label>Ćwiczenie<input value={x.name} onChange={(e) => changeExercise(i, 'name', e.target.value)} placeholder="np. Przysiad"/></label><label>Serie<input type="number" min="1" max="20" value={x.sets} onChange={(e) => changeExercise(i, 'sets', e.target.value)}/></label><label>Powtórzenia<input type="number" min="1" max="100" value={x.reps} onChange={(e) => changeExercise(i, 'reps', e.target.value)}/></label><label>Ciężar kg<input type="number" min="0" max="1000" step="0.5" value={x.weight_kg ?? ''} onChange={(e) => changeExercise(i, 'weight_kg', e.target.value)}/></label>{exercises.length > 1 && <button type="button" className="remove-exercise" onClick={() => setExercises((old) => old.filter((_, j) => j !== i))} aria-label="Usuń ćwiczenie"><X size={13}/></button>}</div>)}<label>NOTATKI<textarea maxLength={1000} value={workNotes} onChange={(e) => setWorkNotes(e.target.value)}/></label><button className="solid-button" disabled={busy}>{busy ? 'ZAPISYWANIE…' : 'ZAPISZ TRENING'}</button></form><section className="content-card"><h3><TrendingUp size={18}/> OSTATNIE TRENINGI</h3>{workouts.slice(0,25).map((w) => <details className="workout-item" key={w.id}><summary><span><strong>{w.title}</strong><small>{formatDate(w.performed_on)}</small></span><ChevronRight size={15}/></summary><div>{parseExercises(w.exercises_json).map((x, i) => <p key={i}>{x.name} — {x.sets} × {x.reps}{x.weight_kg !== null ? ` · ${x.weight_kg} kg` : ''}</p>)}{w.notes && <small>{w.notes}</small>}</div></details>)}{workouts.length === 0 && <p className="muted-text">Zapisz pierwszy trening, aby zacząć śledzić regularność.</p>}</section></div>}
          {activeTab === 'progress' && <div className="two-columns"><section className="content-card"><h3><BarChart3 size={18}/> TRENINGI — OSTATNIE TYGODNIE</h3><div className="progress-bars">{bars.map((b) => <div key={b.label}><strong>{b.count}</strong><div><i style={{ height: `${(b.count / maxBar) * 100}%` }}/></div><small>{b.label}</small></div>)}</div><p className="muted-text">Wykres korzysta z treningów zapisanych w Systemie Formy.</p></section><form className="content-card" onSubmit={(e) => void saveCheckin(e)}><h3><CheckCircle2 size={18}/> PODSUMOWANIE TYGODNIA</h3><p className="muted-text">Tydzień od {formatDate(monday(new Date()))}. Możesz nadpisać podsumowanie dla bieżącego tygodnia.</p><label>WYKONANE TRENINGI<select value={checkinCount} onChange={(e) => setCheckinCount(e.target.value)}>{Array.from({ length: 15 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label><label>REGULARNOŚĆ (1–5)<select value={regularity} onChange={(e) => setRegularity(e.target.value)}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label><label>CO POSZŁO DOBRZE / CO PRZESZKADZAŁO?<textarea maxLength={1000} value={checkinNotes} onChange={(e) => setCheckinNotes(e.target.value)}/></label><button className="solid-button" disabled={busy}>ZAPISZ PODSUMOWANIE</button></form><section className="content-card full-width"><h3><FileText size={18}/> HISTORIA PODSUMOWAŃ</h3>{checkins.length ? checkins.map((c) => <div className="list-row" key={c.id}><div><strong>Tydzień od {formatDate(c.week_start)}</strong><small>{c.training_count} treningów · regularność {c.regularity}/5</small>{c.notes && <small>{c.notes}</small>}</div></div>) : <p className="muted-text">Podsumowania pojawią się po zapisaniu pierwszego tygodnia.</p>}</section></div>}
          {activeTab === 'premium' && <section className="content-card premium-card"><Crown size={24}/><h3>SYSTEM FORMY PREMIUM</h3><p>Premium będzie rozwijane jako osobny dostęp do funkcji i materiałów. Produkty kupione jednorazowo pozostają niezależne od subskrypcji.</p><p className="muted-text">Płatności za Premium nie zostały jeszcze podłączone do automatycznego checkoutu.</p></section>}
          {activeTab === 'admin' && isAdmin && <div className="two-columns"><form className="content-card" onSubmit={(e) => void addProduct(e)}><h3><Upload size={18}/> DODAJ PRODUKT</h3><p className="muted-text">Dodaj opis, cenę i plik. PDF i XLSX będą przechowywane w prywatnym R2.</p><label>NAZWA<input name="title" required maxLength={140} placeholder="np. Zacznij trenować"/></label><label>KLUCZ (MAŁE LITERY / MYŚLNIKI)<input name="product_key" required pattern="[a-z0-9-]+" maxLength={100} placeholder="np. zacznij-trenowac"/></label><label>OPIS<textarea name="description" required maxLength={2000}/></label><div className="form-grid"><label>RODZAJ<select name="product_type" defaultValue="ebook"><option value="ebook">E-book / PDF</option><option value="training_plan">Plan treningowy</option><option value="guide">Poradnik</option><option value="bundle">Pakiet</option><option value="other">Inny materiał</option></select></label><label>CENA (PLN)<input type="number" name="price_amount" min="0" step="0.01" defaultValue="0" required/></label></div><label className="check-row"><input name="is_free" type="checkbox" value="true"/> Produkt bezpłatny</label><label>LINK DO ZAKUPU HTTPS (OPCJONALNIE)<input name="checkout_url" type="url" placeholder="https://…"/></label><label>PLIK (PDF, XLSX, DOCX, ZIP, CSV, TXT; DO 25 MB)<input name="file" type="file" accept=".pdf,.xlsx,.docx,.zip,.csv,.txt" required/></label><label className="check-row"><input name="is_published" type="checkbox" value="true" defaultChecked/> Opublikuj w katalogu</label><button className="solid-button" disabled={savingProduct}>{savingProduct ? 'DODAWANIE…' : 'DODAJ PRODUKT'}</button>{adminError && <p className="form-error">{adminError}</p>}</form><div className="content-card"><form onSubmit={(e) => void grantAccess(e)}><h3><ShieldCheck size={18}/> POTWIERDŹ ZAKUP</h3><p className="muted-text">Tego formularza użyj dopiero po sprawdzeniu płatności w operatorze. Na tym etapie odblokowanie płatnych produktów wymaga ręcznego potwierdzenia.</p><label>E-MAIL KUPUJĄCEGO<input type="email" name="email" required placeholder="klient@przyklad.pl"/></label><label>PRODUKT<select name="product_key" required defaultValue="">{adminProducts.filter((p) => !p.is_free).map((p) => <option key={p.id} value={p.product_key}>{p.title}</option>)}</select></label><button className="outline-button" disabled={savingGrant}>{savingGrant ? 'PRZYPISYWANIE…' : 'PRZYPISZ DOSTĘP'}</button>{adminError && <p className="form-error">{adminError}</p>}</form><div className="admin-product-list"><h4>KATALOG I PUBLIKACJA</h4>{adminProducts.map((p) => <details className="admin-product-item" key={p.id}><summary><span><strong>{p.title}</strong><small>{p.product_key} · {p.is_free ? 'Darmowy' : (p.price_amount > 0 ? p.price_amount.toFixed(2) + ' zł' : 'Cena nieustawiona')} · {p.is_published ? 'Opublikowany' : 'Szkic / ukryty'}</small><small>Plik: {p.original_filename || 'brak nazwy pliku'}</small></span><ChevronRight size={16}/></summary><form className="admin-product-settings" onSubmit={(e) => void saveProductSettings(e, p)}><label>CENA (PLN)<input name="price_amount" type="number" min="0" max="100000" step="0.01" defaultValue={p.price_amount}/></label><label>LINK DO ZAKUPU (HTTPS)<input name="checkout_url" type="url" defaultValue={p.checkout_url || ''} placeholder="https://… (opcjonalnie)"/></label><label className="check-row"><input name="is_free" type="checkbox" value="true" defaultChecked={Boolean(p.is_free)}/> Materiał bezpłatny</label><label className="check-row"><input name="is_published" type="checkbox" value="true" defaultChecked={Boolean(p.is_published)}/> Publikuj w katalogu</label><button className="outline-button" disabled={savingProductSettings === p.product_key}>{savingProductSettings === p.product_key ? 'ZAPISYWANIE…' : 'ZAPISZ USTAWIENIA'}</button></form></details>)}{adminProducts.length === 0 && <p className="muted-text">Nie dodano jeszcze produktów. Uruchom skrypt seedowania w README-ADMIN-R2.md albo dodaj produkt formularzem powyżej.</p>}</div></div></div>}
        </div>}
      </>}
    </section></div>}
    {legalPage && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setLegalPage(null); }}><section className="legal-modal"><button className="modal-close" onClick={() => setLegalPage(null)}><X size={18}/></button><p className="eyebrow muted">SYSTEM FORMY / INFORMACJE</p><h2>{legalPage === 'terms' ? 'REGULAMIN.' : 'POLITYKA PRYWATNOŚCI.'}</h2><p>{legalPage === 'terms' ? 'Przed uruchomieniem płatnej sprzedaży należy opublikować pełny regulamin obejmujący zakupy, płatności, dostęp do plików, odstąpienie od umowy i reklamacje.' : 'Przed uruchomieniem sprzedaży należy uzupełnić informacje o administratorze danych, podstawach i celach przetwarzania, okresach przechowywania, prawach użytkownika i używanych usługach.'}</p><button className="outline-button" onClick={() => setLegalPage(null)}>ZAMKNIJ</button></section></div>}
    {notice && <div className={'toast toast-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.kind === 'success' ? <CheckCircle2 size={18}/> : notice.kind === 'error' ? <ShieldCheck size={18}/> : <Mail size={18}/>}</span><p>{notice.message}</p><button onClick={() => setNotice(null)} aria-label="Zamknij"><X size={15}/></button></div>}
  </main>;
}
