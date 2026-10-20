import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight,
  ClipboardList, Crown, Dumbbell, FileText, Flame, Headphones, LockKeyhole, LogOut,
  Menu, ShoppingBag, UserRound, X,
} from 'lucide-react';
import {
  AuthError, AuthUser, CustomerOverview, consumeAuthRedirect, getCurrentUser,
  getCustomerOverview, isAuthConfigured, requestPasswordReset, signIn, signOut, signUp,
  updatePassword,
} from './lib/supabaseAuth';

type CategoryKey = 'wyzwania' | 'produkty' | 'plan' | 'prowadzenie' | 'program' | 'premium';
type OfferItem = { title: string; type: string; description: string; meta: string; icon: typeof Dumbbell; details: string[] };
type Category = {
  key: CategoryKey; number: string; label: string; shortLabel: string; headline: string;
  intro: string; summary: string; icon: typeof Dumbbell; stage: string; items: OfferItem[];
};
type AccountMode = 'login' | 'signup' | 'recovery' | 'reset' | 'dashboard';
type ModalState = { type: 'offer'; item: OfferItem; category: Category } | { type: 'account' } | null;

const categories: Category[] = [
  {
    key: 'wyzwania', number: '01', label: 'Wyzwania treningowe', shortLabel: 'Wyzwania',
    headline: 'KONKRETNY CEL. OKREŚLONY CZAS.',
    intro: 'Gotowe programy treningowe zaprojektowane wokół jednego celu i jasno określonego czasu trwania.',
    summary: 'Gotowe programy z celem i czasem trwania.', icon: Flame, stage: 'KATALOG W PRZYGOTOWANIU',
    items: [
      { title: 'Duża klata w domu', type: 'WYZWANIE TRENINGOWE', description: 'Koncepcja programu ukierunkowanego na trening klatki piersiowej w warunkach domowych.', meta: '12 TYGODNI', icon: Dumbbell, details: ['Trening w domu jako główne założenie programu.', 'Jasno określony czas trwania: 12 tygodni.', 'Szczegółowy harmonogram i zawartość wymagają przygotowania przed uruchomieniem sprzedaży.'] },
      { title: '30 dni regularności', type: 'WYZWANIE TRENINGOWE', description: 'Koncepcja programu, który pomaga zbudować nawyk regularnego podejmowania aktywności.', meta: '30 DNI', icon: Flame, details: ['Główny cel: wypracowanie regularności.', 'Jasno określony czas trwania: 30 dni.', 'Konkretne treningi, plan tygodnia i materiały trzeba uzupełnić przed sprzedażą.'] },
      { title: 'Budowanie siły', type: 'WYZWANIE TRENINGOWE', description: 'Koncepcja programu nastawionego na rozwijanie siły w uporządkowanym cyklu.', meta: '8 TYGODNI', icon: Dumbbell, details: ['Główny cel: rozwój siły.', 'Jasno określony czas trwania: 8 tygodni.', 'Dobór ćwiczeń, progresja i poziomy zaawansowania wymagają dopracowania.'] },
    ],
  },
  {
    key: 'produkty', number: '02', label: 'Produkty cyfrowe', shortLabel: 'Produkty cyfrowe',
    headline: 'WIEDZA, DO KTÓREJ WRACASZ.', intro: 'E-booki, poradniki i materiały cyfrowe sprzedawane niezależnie od wyzwań i subskrypcji.',
    summary: 'E-booki, poradniki i materiały cyfrowe.', icon: BookOpen, stage: 'KATALOG W PRZYGOTOWANIU',
    items: [
      { title: 'E-booki treningowe', type: 'PRODUKT CYFROWY', description: 'Materiały do samodzielnego wykorzystania, dostępne po zakupie na określonych zasadach.', meta: 'DO POBRANIA', icon: BookOpen, details: ['Osobna kategoria, niezależna od wyzwań treningowych.', 'Po wdrożeniu zakupów produkt będzie przypisany do konta klienta.', 'Tytuły, pliki, ceny i warunki dostępu trzeba uzupełnić przed sprzedażą.'] },
      { title: 'Poradniki i materiały', type: 'PRODUKT CYFROWY', description: 'Dodatkowe materiały edukacyjne, które nie muszą stanowić pełnego programu treningowego.', meta: 'DOSTĘP PO ZAKUPIE', icon: FileText, details: ['Poradniki pozostają oddzielone od gotowych programów treningowych.', 'Zakupione osobno materiały mają pozostać dostępne zgodnie z warunkami zakupu, niezależnie od Premium.', 'Lista materiałów i formatów jest jeszcze do uzupełnienia.'] },
    ],
  },
  {
    key: 'plan', number: '03', label: 'Indywidualny plan treningowy', shortLabel: 'Plan indywidualny',
    headline: 'PLAN DOPASOWANY DO CIEBIE.', intro: 'Jednorazowa usługa przygotowania planu — z zamówieniem, ankietą i realizacją po zakupie.',
    summary: 'Jednorazowa usługa przygotowywana dla klienta.', icon: ClipboardList, stage: 'PROCES DO WDROŻENIA',
    items: [{ title: 'Twój indywidualny plan', type: 'USŁUGA INDYWIDUALNA', description: 'Klient składa zamówienie, opłaca usługę i wypełnia ankietę. Plan jest następnie przygotowywany indywidualnie.', meta: 'PLAN PRZYGOTOWYWANY INDYWIDUALNIE', icon: ClipboardList, details: ['1. Zamówienie i płatność po integracji systemu zakupowego.', '2. Ankieta klienta po zakupie.', '3. Status realizacji: oczekuje na ankietę, w przygotowaniu, gotowy lub anulowany / zwrócony.', '4. Gotowy plan przypisany do konta klienta.'] }],
  },
  {
    key: 'prowadzenie', number: '04', label: 'Prowadzenie online', shortLabel: 'Prowadzenie online',
    headline: 'WSPÓŁPRACA, NIE TYLKO PLAN.', intro: 'Osobna usługa zdalnego prowadzenia. Zakres, czas trwania i sposób kontaktu muszą być opisane przed uruchomieniem.',
    summary: 'Osobna usługa zdalnej współpracy.', icon: Headphones, stage: 'ZAKRES DO USTALENIA',
    items: [{ title: 'Prowadzenie online', type: 'USŁUGA WSPÓŁPRACY', description: 'Dłuższa współpraca zdalna, oddzielona od jednorazowego przygotowania planu.', meta: 'SZCZEGÓŁY WKRÓTCE', icon: Headphones, details: ['Prowadzenie online jest osobną usługą, a nie inną nazwą indywidualnego planu.', 'Zakres kontaktu, czas trwania, aktualizacje i cena wymagają określenia.', 'System będzie musiał obsługiwać status klienta i informacje o aktywnej współpracy.'] }],
  },
  {
    key: 'program', number: '05', label: 'Program Systemu Formy', shortLabel: 'Program Systemu Formy',
    headline: 'FLAGOWA OFERTA SYSTEMU FORMY.', intro: 'Osobny program o wyższej wartości, pozycjonowany jako główna, rozbudowana oferta marki.',
    summary: 'Flagowy produkt o wyższej wartości.', icon: Crown, stage: 'OFERTA DO OPRACOWANIA',
    items: [{ title: 'Program Systemu Formy', type: 'OFERTA FLAGOWA', description: 'Wyróżniony produkt marki z własnym opisem, zakresem, ceną i ścieżką klienta.', meta: 'OFERTA ROZBUDOWANA', icon: Crown, details: ['Program jest odrębnym produktem — nie należy utożsamiać go z subskrypcją Premium.', 'Zakres, długość programu, cena i sposób realizacji nie zostały jeszcze określone.', 'Po zatwierdzeniu założeń oferta otrzyma własną stronę i ścieżkę zakupu.'] }],
  },
  {
    key: 'premium', number: '06', label: 'Premium', shortLabel: 'Premium',
    headline: 'SUBSKRYPCJA. DODATKOWE MOŻLIWOŚCI.', intro: 'Abonament dający dostęp do określonych funkcji i materiałów Premium. Nie zastępuje zakupionych produktów jednorazowych.',
    summary: 'Subskrypcja do funkcji i treści Premium.', icon: LockKeyhole, stage: 'ZAKRES DO USTALENIA',
    items: [{ title: 'Dostęp Premium', type: 'SUBSKRYPCJA', description: 'Odnawialny dostęp do funkcji i materiałów objętych subskrypcją, zgodnie z jej warunkami.', meta: 'MODEL SUBSKRYPCYJNY', icon: LockKeyhole, details: ['Lista funkcji i materiałów Premium musi zostać określona.', 'Po zakończeniu subskrypcji wygasa dostęp do elementów zależnych od Premium.', 'Produkty cyfrowe kupione osobno mają pozostać dostępne zgodnie z warunkami zakupu.'] }],
  },
];

function Brand() {
  return <a className="brand" href="#top" aria-label="System Formy — strona główna"><img className="brand-logo" src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="System Formy" /><span className="brand-tagline">TRENING • KONSEKWENCJA • PROGRES</span></a>;
}

function authMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Wystąpił nieoczekiwany błąd.';
  const normalized = raw.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'Nieprawidłowy e-mail lub hasło.';
  if (normalized.includes('email not confirmed')) return 'Najpierw potwierdź adres e-mail za pomocą linku wysłanego przez nasz system.';
  if (normalized.includes('already registered') || normalized.includes('user already registered')) return 'Konto z tym adresem e-mail już istnieje. Zaloguj się lub odzyskaj hasło.';
  if (normalized.includes('password should be at least') || normalized.includes('weak password')) return 'Hasło jest za słabe. Użyj co najmniej 8 znaków.';
  if (normalized.includes('rate limit')) return 'Wykonano zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  if (raw.includes('VITE_SUPABASE_URL')) return 'Logowanie nie jest jeszcze skonfigurowane. Wykonaj instrukcję w pliku SUPABASE_SETUP.md.';
  if (normalized.includes('failed to fetch')) return 'Nie udało się połączyć z usługą logowania. Sprawdź konfigurację Supabase.';
  return raw;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date);
}

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(value);
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('wyzwania');
  const [modal, setModal] = useState<ModalState>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<AccountMode>('login');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [customerData, setCustomerData] = useState<CustomerOverview | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const active = useMemo(() => categories.find((category) => category.key === activeCategory) ?? categories[0], [activeCategory]);
  const ActiveIcon = active.icon;

  useEffect(() => {
    let alive = true;
    async function initialize() {
      try {
        if (isAuthConfigured) {
          try {
            const redirectType = consumeAuthRedirect();
            if (redirectType === 'recovery') setAccountMode('reset');
            else if (redirectType === 'signup') setMessage('Adres e-mail został potwierdzony. Możesz się zalogować.');
          } catch (redirectError) {
            if (alive) setError(authMessage(redirectError));
          }
          const user = await getCurrentUser();
          if (alive && user) {
            setCurrentUser(user);
            setAccountMode((mode) => mode === 'reset' ? 'reset' : 'dashboard');
          }
        }
      } finally {
        if (alive) setAuthReady(true);
      }
    }
    void initialize();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (currentUser && isAuthConfigured) {
      setCustomerData(null);
      void getCustomerOverview().then((data) => { if (alive) setCustomerData(data); })
        .catch(() => { if (alive) setCustomerData({ orders: [], entitlements: [], planRequests: [], errors: ['Nie udało się pobrać danych konta.'] }); });
    } else setCustomerData(null);
    return () => { alive = false; };
  }, [currentUser]);

  const chooseCategory = (key: CategoryKey) => {
    setActiveCategory(key);
    setMenuOpen(false);
    document.getElementById('oferta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openAccount = () => {
    setMenuOpen(false);
    setError('');
    setMessage('');
    setPassword('');
    setPasswordAgain('');
    setAccountMode(currentUser ? 'dashboard' : 'login');
    setModal({ type: 'account' });
  };

  const switchAccountMode = (mode: AccountMode) => {
    setAccountMode(mode);
    setError('');
    setMessage('');
    setPassword('');
    setPasswordAgain('');
  };

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!isAuthConfigured) {
      setError('Logowanie nie jest jeszcze skonfigurowane. Dodaj zmienne VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY zgodnie z SUPABASE_SETUP.md.');
      return;
    }
    if (accountMode === 'signup' && password !== passwordAgain) {
      setError('Podane hasła nie są takie same.');
      return;
    }
    if ((accountMode === 'signup' || accountMode === 'reset') && password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    setBusy(true);
    try {
      if (accountMode === 'login') {
        const user = await signIn(email, password);
        setCurrentUser(user);
        setAccountMode('dashboard');
        setPassword('');
        setMessage('Zalogowano pomyślnie.');
      } else if (accountMode === 'signup') {
        const result = await signUp(email, password);
        if (result.confirmationRequired) {
          setAccountMode('login');
          setPassword('');
          setMessage('Konto zostało utworzone. Sprawdź skrzynkę e-mail i potwierdź adres, a potem zaloguj się.');
        } else if (result.user) {
          setCurrentUser(result.user);
          setAccountMode('dashboard');
          setPassword('');
          setMessage('Konto zostało utworzone.');
        } else {
          setAccountMode('login');
          setMessage('Sprawdź pocztę, aby dokończyć rejestrację.');
        }
      } else if (accountMode === 'recovery') {
        await requestPasswordReset(email);
        setMessage('Jeśli konto dla podanego adresu istnieje, wysłaliśmy instrukcję odzyskania hasła. Sprawdź też folder spam.');
      } else if (accountMode === 'reset') {
        await updatePassword(password);
        setAccountMode('login');
        setPassword('');
        setPasswordAgain('');
        setMessage('Hasło zostało zmienione. Zaloguj się nowym hasłem.');
      }
    } catch (submitError) {
      setError(authMessage(submitError instanceof AuthError ? submitError : submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try { await signOut(); }
    catch { /* Lokalna sesja jest usuwana również wtedy, gdy API logout nie odpowiada. */ }
    setCurrentUser(null);
    setCustomerData(null);
    setAccountMode('login');
    setPassword('');
    setMessage('Wylogowano.');
    setError('');
    setBusy(false);
  }

  const accountTitle = accountMode === 'signup' ? 'UTWÓRZ KONTO.'
    : accountMode === 'recovery' ? 'ODZYSKAJ DOSTĘP.'
      : accountMode === 'reset' ? 'USTAW NOWE HASŁO.'
        : 'DOBRZE CIĘ WIDZIEĆ.';

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="Główna nawigacja">
          <a href="#linie-oferty">OFERTA</a><a href="#jak-dziala">JAK TO DZIAŁA</a>
        </nav>
        <div className="header-actions">
          <button className="account-button" onClick={openAccount}>
            <UserRound size={16} /> <span>{currentUser ? 'MOJE KONTO' : 'ZALOGUJ SIĘ'}</span> <ArrowUpRight size={15} />
          </button>
          <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && <div className="mobile-menu">
          <a href="#linie-oferty" onClick={() => setMenuOpen(false)}>Oferta</a>
          <a href="#jak-dziala" onClick={() => setMenuOpen(false)}>Jak to działa</a>
          <button onClick={openAccount}><UserRound size={16} /> {currentUser ? 'Moje konto' : 'Zaloguj się'}</button>
          {!currentUser && <button onClick={() => { openAccount(); setAccountMode('signup'); }}><CheckCircle2 size={16} /> Zarejestruj się</button>}
        </div>}
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> TWOJA DROGA. TWÓJ SYSTEM.</div>
          <h1 id="hero-title">FORMA NIE ROBI SIĘ <span>SAMA.</span></h1>
          <p className="hero-copy">Mniej chaosu. Więcej konsekwencji. Wybierz rozwiązanie, które pasuje do Twojego celu — od gotowego wyzwania po indywidualną współpracę.</p>
          <a className="primary-button" href="#linie-oferty">POZNAJ MOŻLIWOŚCI <ArrowUpRight size={17} /></a>
          <div className="hero-footnote"><span>01 / 06</span> JASNY KIERUNEK. REALNY PLAN. SYSTEMATYCZNOŚĆ.</div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" /><div className="art-crosshair">+</div><img src="/2F1E20BF-50D5-450A-99FB-4408BA767302.png" alt="" className="hero-logo" /><div className="art-caption">BUILT WITH<br />DISCIPLINE</div><div className="art-line" /></div>
      </section>

      <section className="manifesto-strip" aria-label="Założenia Systemu Formy">
        <span><CheckCircle2 size={15} /> WYBIERZ SWÓJ CEL</span><span><CheckCircle2 size={15} /> DZIAŁAJ WEDŁUG PLANU</span><span><CheckCircle2 size={15} /> BUDUJ KONSEKWENCJĘ</span>
      </section>

      <section className="lines-section" id="linie-oferty">
        <div className="section-heading"><div><p className="eyebrow muted">SYSTEM FORMY / OFERTA</p><h2>JEDNA MARKA.<br /><span>SZEŚĆ DRÓG.</span></h2></div><p className="section-intro">Każda forma współpracy ma inne zadanie. Przewiń kategorie i wybierz obszar, który chcesz poznać.</p></div>
        <div className="category-strip" role="tablist" aria-label="Kategorie oferty">
          {categories.map((category) => { const Icon = category.icon; const selected = category.key === activeCategory; return <button key={category.key} role="tab" aria-selected={selected} className={`category-tab${selected ? ' is-active' : ''}`} onClick={() => chooseCategory(category.key)}><span className="category-tab-number">{category.number}</span><Icon size={18} /><span>{category.shortLabel}</span><ArrowUpRight className="tab-arrow" size={14} /></button>; })}
        </div>
      </section>

      <section className="offer-section" id="oferta" aria-live="polite">
        <div className="offer-heading"><div className="offer-title-icon"><ActiveIcon size={22} /></div><div><p className="eyebrow muted">KATEGORIA {active.number} / 06</p><h2>{active.headline}</h2><p className="offer-intro">{active.intro}</p></div><span className="stage-label"><span className="stage-dot" /> {active.stage}</span></div>
        <div className={`offer-grid offer-count-${active.items.length}`}>
          {active.items.map((item, index) => { const Icon = item.icon; return <article className="offer-card" key={item.title}><div className="offer-card-top"><span>{active.number}.{String(index + 1).padStart(2, '0')}</span><Icon size={20} /></div><span className="offer-type">{item.type}</span><h3>{item.title}</h3><p className="offer-description">{item.description}</p><div className="offer-card-bottom"><span className="offer-meta">{item.meta}</span><button className="text-action" onClick={() => setModal({ type: 'offer', item, category: active })}>POZNAJ ZAŁOŻENIA <ArrowRight size={15} /></button></div></article>; })}
        </div>
        <p className="stage-note"><LockKeyhole size={14} /> Katalog i opisy są przygotowane koncepcyjnie. Zakupy, płatności i aktywacja produktów nie są jeszcze podłączone.</p>
      </section>

      <section className="journey-section" id="jak-dziala"><div className="journey-copy"><p className="eyebrow muted">JAK TO MA DZIAŁAĆ</p><h2>OD WYBORU<br />DO <span>DZIAŁANIA.</span></h2><p>Docelowo zakupy, indywidualna współpraca i zakupione materiały będą uporządkowane w jednym miejscu.</p></div><div className="journey-steps"><div className="journey-step"><span>01</span><div><h3>Wybierasz</h3><p>Wyzwanie, materiał cyfrowy albo usługę dopasowaną do celu.</p></div><ChevronRight size={18} /></div><div className="journey-step"><span>02</span><div><h3>Realizujesz</h3><p>Po wdrożeniu zakupów otrzymasz właściwą instrukcję i dostęp.</p></div><ChevronRight size={18} /></div><div className="journey-step"><span>03</span><div><h3>Masz wszystko w jednym miejscu</h3><p>Strefa klienta uporządkuje dane konta, zamówienia, plany i przypisane materiały.</p></div><ChevronRight size={18} /></div></div></section>

      <section className="closing-cta"><div><p className="eyebrow"><span className="eyebrow-dot" /> ZACZNIJ OD DOBREGO WYBORU</p><h2>TWÓJ SYSTEM.<br /><span>TWOJE TEMPO.</span></h2></div><a className="secondary-button" href="#linie-oferty">WYBIERZ KATEGORIĘ <ArrowDownRight size={18} /></a></section>
      <footer className="footer"><Brand /><span className="footer-motto">RUSZAJ. BUDUJ. POWTARZAJ.</span><span className="footer-copy">© {new Date().getFullYear()} SYSTEM FORMY</span></footer>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className={`detail-modal${modal.type === 'account' ? ' account-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="modal-close" onClick={() => setModal(null)} aria-label="Zamknij okno"><X size={20} /></button>
          {modal.type === 'offer' ? <>
            <p className="eyebrow muted">{modal.category.label.toUpperCase()}</p><span className="modal-type">{modal.item.type}</span><h2 id="modal-title">{modal.item.title}</h2><p className="modal-description">{modal.item.description}</p><div className="modal-divider" /><p className="modal-subhead">ZAŁOŻENIA</p><ul className="detail-list">{modal.item.details.map((detail) => <li key={detail}><span />{detail}</li>)}</ul><div className="modal-notice"><LockKeyhole size={17} /><span>Oferta nie jest jeszcze dostępna do zakupu. To opis założeń, a nie aktywna usługa.</span></div><button className="modal-done" onClick={() => setModal(null)}>ROZUMIEM <ArrowUpRight size={16} /></button>
          </> : <>
            <div className="account-modal-heading"><p className="eyebrow muted">SYSTEM FORMY / STREFA KLIENTA</p>{currentUser && accountMode === 'dashboard' ? <div className="modal-account-icon"><UserRound size={24} /></div> : <div className="modal-account-icon"><LockKeyhole size={24} /></div>}<h2 id="modal-title">{accountMode === 'dashboard' ? <>TWOJE KONTO<span>.</span></> : <>{accountTitle.split('.')[0]}<span>.</span></>}</h2>
              <p className="modal-description">{accountMode === 'dashboard' ? `Zalogowano jako ${currentUser?.email ?? 'użytkownik'}.` : accountMode === 'signup' ? 'Utwórz konto, aby w przyszłości mieć w jednym miejscu swoje materiały i statusy usług.' : accountMode === 'recovery' ? 'Wyślemy wiadomość z bezpiecznym linkiem do zmiany hasła.' : accountMode === 'reset' ? 'Ustaw nowe hasło do swojego konta.' : 'Zaloguj się, aby przejść do swojej strefy klienta.'}</p>
            </div>

            {accountMode === 'dashboard' && currentUser ? <div className="customer-dashboard">
              <div className="account-toolbar"><div><span className="dashboard-label">STATUS SESJI</span><strong><span className="online-dot" /> ZALOGOWANO</strong></div><button className="signout-button" onClick={() => void handleSignOut()} disabled={busy}><LogOut size={15} /> WYLOGUJ</button></div>
              {customerData === null ? <p className="dashboard-loading">Ładowanie danych konta…</p> : <>
                {customerData.errors.length > 0 && <div className="setup-warning"><LockKeyhole size={17} /><div><strong>Połączenie z kontem działa, ale dane sklepu nie są jeszcze gotowe.</strong><p>Dodaj tabele i polityki dostępu z pliku <code>supabase/schema.sql</code>. Zamówienia i uprawnienia pojawią się po podłączeniu zaplecza płatności.</p></div></div>}
                <div className="dashboard-section"><div className="dashboard-section-heading"><ShoppingBag size={18} /><h3>MOJE ZAMÓWIENIA</h3></div>{customerData.orders.length ? <div className="account-list">{customerData.orders.map((order) => <div className="account-list-row" key={order.id}><div><strong>{order.order_number}</strong><span>{formatDate(order.created_at)} · {order.status}</span></div><b>{formatPrice(order.total_amount, order.currency)}</b></div>)}</div> : <p className="empty-state">Nie ma jeszcze zamówień na tym koncie.</p>}</div>
                <div className="dashboard-section"><div className="dashboard-section-heading"><BookOpen size={18} /><h3>ZAKUPIONE MATERIAŁY</h3></div>{customerData.entitlements.length ? <div className="account-list">{customerData.entitlements.map((entitlement) => <div className="account-list-row" key={entitlement.id}><div><strong>{entitlement.product_title}</strong><span>{entitlement.product_type} · {entitlement.access_status}</span></div><span className="entitlement-date">{formatDate(entitlement.created_at)}</span></div>)}</div> : <p className="empty-state">Zakupione materiały pojawią się tutaj po podłączeniu płatności i przypisania produktów.</p>}</div>
                <div className="dashboard-section"><div className="dashboard-section-heading"><ClipboardList size={18} /><h3>INDYWIDUALNE PLANY</h3></div>{customerData.planRequests.length ? <div className="account-list">{customerData.planRequests.map((request) => <div className="account-list-row" key={request.id}><div><strong>Indywidualny plan</strong><span>Dodano: {formatDate(request.created_at)}</span></div><span className="status-pill">{request.status}</span></div>)}</div> : <p className="empty-state">Status realizacji planu pojawi się tutaj po wdrożeniu procesu zamówienia i ankiety.</p>}</div>
              </>}
            </div> : <form className="auth-form" onSubmit={(event) => void handleAuthSubmit(event)}>
              {accountMode !== 'reset' && <label className="field-label">ADRES E-MAIL<input type="email" name="email" autoComplete="email" placeholder="ty@przyklad.pl" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
              {(accountMode === 'login' || accountMode === 'signup' || accountMode === 'reset') && <label className="field-label">{accountMode === 'reset' ? 'NOWE HASŁO' : 'HASŁO'}<input type="password" name="password" autoComplete={accountMode === 'login' ? 'current-password' : 'new-password'} placeholder={accountMode === 'reset' ? 'Minimum 8 znaków' : 'Minimum 8 znaków'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
              {(accountMode === 'signup' || accountMode === 'reset') && <label className="field-label">POWTÓRZ HASŁO<input type="password" name="passwordAgain" autoComplete="new-password" placeholder="Wpisz hasło ponownie" minLength={8} value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} required /></label>}
              {!isAuthConfigured && <div className="setup-warning auth-setup-warning"><LockKeyhole size={17} /><div><strong>Logowanie wymaga jednorazowej konfiguracji.</strong><p>Utwórz projekt Supabase i dodaj zmienne <code>VITE_SUPABASE_URL</code> oraz <code>VITE_SUPABASE_ANON_KEY</code> do konfiguracji builda Cloudflare. Instrukcja jest w pliku <code>SUPABASE_SETUP.md</code>.</p></div></div>}
              {error && <div className="form-feedback is-error" role="alert">{error}</div>}{message && <div className="form-feedback is-success" role="status">{message}</div>}
              <button className="auth-submit" type="submit" disabled={busy || !authReady}>{busy ? 'CHWILA…' : accountMode === 'login' ? 'ZALOGUJ SIĘ' : accountMode === 'signup' ? 'UTWÓRZ KONTO' : accountMode === 'recovery' ? 'WYŚLIJ LINK DO ZMIANY HASŁA' : 'USTAW NOWE HASŁO'} <ArrowUpRight size={16} /></button>
              <div className="auth-links">{accountMode === 'login' ? <><button type="button" onClick={() => switchAccountMode('recovery')}>Nie pamiętam hasła</button><button type="button" onClick={() => switchAccountMode('signup')}>Utwórz konto</button></> : <button type="button" onClick={() => switchAccountMode('login')}>Wróć do logowania</button>}</div>
              <p className="privacy-note"><LockKeyhole size={13} /> Hasło nie jest przechowywane przez stronę. Uwierzytelnianie obsługuje Supabase po podłączeniu konfiguracji.</p>
            </form>}
            {accountMode === 'dashboard' && <>{error && <div className="form-feedback is-error" role="alert">{error}</div>}{message && <div className="form-feedback is-success" role="status">{message}</div>}</>}
          </>}
        </section>
      </div>}
    </main>
  );
}
