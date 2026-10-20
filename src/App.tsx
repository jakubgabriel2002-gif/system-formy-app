import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight,
  ClipboardList, Crown, Dumbbell, FileText, Flame, Headphones, LockKeyhole, LogOut,
  Mail, Menu, ShieldCheck, ShoppingBag, UserRound, X,
} from 'lucide-react';

type CategoryKey = 'wyzwania' | 'produkty' | 'plan' | 'prowadzenie' | 'program' | 'premium';
type OfferItem = { title: string; type: string; description: string; meta: string; icon: typeof Dumbbell; details: string[] };
type Category = { key: CategoryKey; number: string; label: string; shortLabel: string; headline: string; intro: string; summary: string; icon: typeof Dumbbell; stage: string; items: OfferItem[] };
type User = { id: string; email: string };
type Order = { id: string; order_number: string; status: string; total_amount: number; currency: string; created_at: string };
type Entitlement = { id: string; product_title: string; product_type: string; access_status: string; created_at: string };
type PlanRequest = { id: string; status: string; created_at: string };
type Overview = { orders: Order[]; entitlements: Entitlement[]; planRequests: PlanRequest[] };
type AccountMode = 'login' | 'signup' | 'recovery' | 'dashboard';
type LegalKind = 'terms' | 'privacy';

const LOGO = '/2F1E20BF-50D5-450A-99FB-4408BA767302.png';

const categories: Category[] = [
  { key: 'wyzwania', number: '01', label: 'Wyzwania treningowe', shortLabel: 'Wyzwania', headline: 'KONKRETNY CEL. OKREŚLONY CZAS.', intro: 'Gotowe programy treningowe zaprojektowane wokół jednego celu i jasno określonego czasu trwania.', summary: 'Gotowe programy z celem i czasem trwania.', icon: Flame, stage: 'KATALOG W PRZYGOTOWANIU', items: [
    { title: 'Duża klata w domu', type: 'WYZWANIE TRENINGOWE', description: 'Koncepcja programu ukierunkowanego na trening klatki piersiowej w warunkach domowych.', meta: '12 TYGODNI', icon: Dumbbell, details: ['Trening w domu jako główne założenie programu.', 'Jasno określony czas trwania: 12 tygodni.', 'Harmonogram i zawartość wymagają przygotowania przed sprzedażą.'] },
    { title: '30 dni regularności', type: 'WYZWANIE TRENINGOWE', description: 'Program pomagający zbudować nawyk regularnego podejmowania aktywności.', meta: '30 DNI', icon: Flame, details: ['Główny cel: wypracowanie regularności.', 'Czas trwania: 30 dni.', 'Treningi i materiały wymagają uzupełnienia.'] },
    { title: 'Budowanie siły', type: 'WYZWANIE TRENINGOWE', description: 'Program nastawiony na rozwijanie siły w uporządkowanym cyklu.', meta: '8 TYGODNI', icon: Dumbbell, details: ['Główny cel: rozwój siły.', 'Czas trwania: 8 tygodni.', 'Dobór ćwiczeń i progresja wymagają dopracowania.'] },
  ] },
  { key: 'produkty', number: '02', label: 'Produkty cyfrowe', shortLabel: 'Produkty cyfrowe', headline: 'WIEDZA, DO KTÓREJ WRACASZ.', intro: 'E-booki, poradniki i materiały cyfrowe sprzedawane niezależnie od wyzwań i subskrypcji.', summary: 'E-booki, poradniki i materiały cyfrowe.', icon: BookOpen, stage: 'KATALOG W PRZYGOTOWANIU', items: [
    { title: 'E-booki treningowe', type: 'PRODUKT CYFROWY', description: 'Materiały do samodzielnego wykorzystania, dostępne po zakupie na określonych zasadach.', meta: 'DO POBRANIA', icon: BookOpen, details: ['Osobna kategoria, niezależna od wyzwań.', 'Po wdrożeniu zakupów produkt będzie przypisany do konta.', 'Tytuły, pliki i ceny trzeba uzupełnić przed sprzedażą.'] },
    { title: 'Poradniki i materiały', type: 'PRODUKT CYFROWY', description: 'Materiały edukacyjne, które nie muszą stanowić pełnego programu treningowego.', meta: 'DOSTĘP PO ZAKUPIE', icon: FileText, details: ['Poradniki pozostają oddzielone od programów treningowych.', 'Dostęp do zakupionych osobno materiałów nie będzie zależeć od Premium, zgodnie z warunkami zakupu.', 'Lista materiałów wymaga uzupełnienia.'] },
  ] },
  { key: 'plan', number: '03', label: 'Indywidualny plan treningowy', shortLabel: 'Plan indywidualny', headline: 'PLAN DOPASOWANY DO CIEBIE.', intro: 'Jednorazowa usługa przygotowania planu — z zamówieniem, ankietą i realizacją po zakupie.', summary: 'Jednorazowa usługa przygotowywana dla klienta.', icon: ClipboardList, stage: 'PROCES DO WDROŻENIA', items: [
    { title: 'Twój indywidualny plan', type: 'USŁUGA INDYWIDUALNA', description: 'Klient składa zamówienie, opłaca usługę i wypełnia ankietę. Plan jest następnie przygotowywany indywidualnie.', meta: 'PLAN PRZYGOTOWYWANY INDYWIDUALNIE', icon: ClipboardList, details: ['Zamówienie i płatność po integracji operatora.', 'Ankieta klienta po zakupie.', 'Status: oczekuje na ankietę, w przygotowaniu, gotowy, anulowany lub zwrócony.', 'Gotowy plan przypisany do konta klienta.'] },
  ] },
  { key: 'prowadzenie', number: '04', label: 'Prowadzenie online', shortLabel: 'Prowadzenie online', headline: 'WSPÓŁPRACA, NIE TYLKO PLAN.', intro: 'Osobna usługa zdalnego prowadzenia. Zakres, czas trwania i sposób kontaktu trzeba opisać przed startem.', summary: 'Osobna usługa zdalnej współpracy.', icon: Headphones, stage: 'ZAKRES DO USTALENIA', items: [
    { title: 'Prowadzenie online', type: 'USŁUGA WSPÓŁPRACY', description: 'Dłuższa współpraca zdalna, oddzielona od jednorazowego przygotowania planu.', meta: 'SZCZEGÓŁY WKRÓTCE', icon: Headphones, details: ['To osobna usługa, a nie inna nazwa indywidualnego planu.', 'Zakres kontaktu, czas trwania, aktualizacje i cena wymagają określenia.', 'System docelowo będzie obsługiwać status aktywnej współpracy.'] },
  ] },
  { key: 'program', number: '05', label: 'Program Systemu Formy', shortLabel: 'Program Systemu Formy', headline: 'FLAGOWA OFERTA SYSTEMU FORMY.', intro: 'Osobny program o wyższej wartości, pozycjonowany jako główna, rozbudowana oferta marki.', summary: 'Flagowy produkt o wyższej wartości.', icon: Crown, stage: 'OFERTA DO OPRACOWANIA', items: [
    { title: 'Program Systemu Formy', type: 'OFERTA FLAGOWA', description: 'Wyróżniony produkt marki z własnym zakresem, ceną i ścieżką klienta.', meta: 'OFERTA ROZBUDOWANA', icon: Crown, details: ['Program jest odrębnym produktem, a nie subskrypcją Premium.', 'Zakres, długość i cena nie zostały jeszcze określone.', 'Po zatwierdzeniu założeń oferta otrzyma własną ścieżkę zakupu.'] },
  ] },
  { key: 'premium', number: '06', label: 'Premium', shortLabel: 'Premium', headline: 'SUBSKRYPCJA. DODATKOWE MOŻLIWOŚCI.', intro: 'Abonament dający dostęp do określonych funkcji i materiałów Premium. Nie zastępuje zakupionych produktów jednorazowych.', summary: 'Subskrypcja do funkcji i treści Premium.', icon: LockKeyhole, stage: 'ZAKRES DO USTALENIA', items: [
    { title: 'Dostęp Premium', type: 'SUBSKRYPCJA', description: 'Odnawialny dostęp do funkcji i materiałów objętych subskrypcją, zgodnie z jej warunkami.', meta: 'MODEL SUBSKRYPCYJNY', icon: LockKeyhole, details: ['Lista funkcji Premium wymaga określenia.', 'Po zakończeniu subskrypcji wygaśnie dostęp do elementów zależnych od Premium.', 'Produkty kupione osobno pozostaną dostępne według warunków zakupu.'] },
  ] },
];

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  let data: unknown = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Wystąpił błąd (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}

function Brand() {
  return <a className="brand" href="#top" aria-label="System Formy — strona główna"><img className="brand-logo" src={LOGO} alt="" /><span className="brand-tagline">TRENING <i>·</i> KONSEKWENCJA <i>·</i> PROGRES</span></a>;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<{ item: OfferItem; category: Category } | null>(null);
  const [legalPage, setLegalPage] = useState<LegalKind | null>(null);
  const [accountMode, setAccountMode] = useState<AccountMode>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const active = useMemo(() => categories.find((category) => category.key === activeCategory) ?? categories[0], [activeCategory]);
  const ActiveIcon = active.icon;

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'verified') setMessage('Adres e-mail został potwierdzony. Możesz się zalogować.');
    api<{ user: User | null }>('/api/auth/me').then((result) => {
      if (alive && result.user) { setCurrentUser(result.user); setAccountMode('dashboard'); }
    }).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : 'Nie udało się sprawdzić sesji.');
    }).finally(() => { if (alive) setAuthReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (currentUser) {
      setOverview(null);
      api<Overview>('/api/account/overview').then((data) => { if (alive) setOverview(data); })
        .catch(() => { if (alive) setOverview({ orders: [], entitlements: [], planRequests: [] }); });
    } else setOverview(null);
    return () => { alive = false; };
  }, [currentUser]);

  function openAccount() {
    setMenuOpen(false); setSelectedOffer(null); setLegalPage(null); setShowAccount(true);
    setAccountMode(currentUser ? 'dashboard' : 'login'); setError(''); setMessage(''); setPassword(''); setPasswordAgain('');
  }
  function switchMode(mode: AccountMode) {
    setAccountMode(mode); setError(''); setMessage(''); setPassword(''); setPasswordAgain('');
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (accountMode === 'login') {
        const result = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setCurrentUser(result.user); setAccountMode('dashboard'); setPassword(''); setMessage('Zalogowano pomyślnie.');
      } else if (accountMode === 'signup') {
        if (password !== passwordAgain) throw new Error('Podane hasła nie są takie same.');
        if (password.length < 10) throw new Error('Hasło musi mieć co najmniej 10 znaków.');
        const result = await api<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
        setCurrentUser(result.user); setAccountMode('dashboard'); setPassword(''); setPasswordAgain(''); setMessage('Konto zostało utworzone.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wykonać operacji.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError('');
    try { await api<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wylogować.'); }
    finally { setCurrentUser(null); setOverview(null); setAccountMode('login'); setPassword(''); setBusy(false); setMessage('Wylogowano.'); }
  }

  const accountTitle = accountMode === 'signup' ? 'UTWÓRZ KONTO.' : accountMode === 'recovery' ? 'ODZYSKAJ DOSTĘP.' : 'DOBRZE CIĘ WIDZIEĆ.';
  const closeOverlay = () => { setShowAccount(false); setSelectedOffer(null); setLegalPage(null); setError(''); };

  return <main className="site-shell" id="top">
    <header className="topbar">
      <Brand />
      <nav className="desktop-nav" aria-label="Główna nawigacja"><a href="#oferta">OFERTA</a><a href="#jak-dziala">JAK TO DZIAŁA</a></nav>
      <div className="header-actions">
        {!menuOpen && <button className="account-button" onClick={openAccount}><UserRound size={16} /><span>{currentUser ? 'MOJE KONTO' : 'ZALOGUJ SIĘ'}</span><ArrowUpRight size={15} /></button>}
        <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'} aria-expanded={menuOpen}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      {menuOpen && <nav className="mobile-menu" aria-label="Menu mobilne"><a href="#oferta" onClick={() => setMenuOpen(false)}>Oferta</a><a href="#jak-dziala" onClick={() => setMenuOpen(false)}>Jak to działa</a><button onClick={openAccount}><UserRound size={16} />{currentUser ? 'Moje konto' : 'Zaloguj się'}</button>{!currentUser && <button onClick={() => { openAccount(); setAccountMode('signup'); }}><CheckCircle2 size={16} />Utwórz konto</button>}</nav>}
    </header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-content"><div className="eyebrow"><span className="eyebrow-dot" /> TWOJA DROGA. TWÓJ SYSTEM.</div><h1 id="hero-title">FORMA NIE ROBI SIĘ <span>SAMA.</span></h1><p className="hero-copy">Mniej chaosu. Więcej konsekwencji. Wybierz rozwiązanie, które pasuje do Twojego celu — od gotowego wyzwania po indywidualną współpracę.</p><a className="primary-button" href="#oferta">POZNAJ MOŻLIWOŚCI <ArrowUpRight size={17} /></a><p className="hero-footnote">JASNY KIERUNEK <i>·</i> REALNY PLAN <i>·</i> SYSTEMATYCZNOŚĆ</p></div>
      <div className="hero-art" aria-hidden="true"><div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" /><div className="art-crosshair">+</div><img src={LOGO} alt="" className="hero-logo" /><div className="art-caption">BUILT WITH<br />DISCIPLINE</div><div className="art-line" /></div>
    </section>

    <section className="catalog-section" id="oferta" aria-live="polite">
      <div className="section-heading"><div><p className="eyebrow muted">SYSTEM FORMY / OFERTA</p><h2>JEDNA MARKA.<br /><span>SZEŚĆ DRÓG.</span></h2></div><p className="section-intro">Każda forma współpracy ma inne zadanie. Wybierz kategorię i poznaj jej założenia — bez przeskakiwania do innego miejsca na stronie.</p></div>
      <div className="category-strip" role="tablist" aria-label="Kategorie oferty">{categories.map((category) => { const Icon = category.icon; const selected = category.key === activeCategory; return <button key={category.key} role="tab" aria-selected={selected} className={`category-tab${selected ? ' is-active' : ''}`} onClick={() => setActiveCategory(category.key)}><span className="category-tab-number">{category.number}</span><Icon size={18} /><span>{category.shortLabel}</span><ArrowUpRight className="tab-arrow" size={14} /></button>; })}</div>
      <div className="offer-panel" role="tabpanel"><div className="offer-heading"><div className="offer-title-icon"><ActiveIcon size={22} /></div><div className="offer-title-copy"><p className="eyebrow muted">KATEGORIA {active.number} / 06</p><h2>{active.headline}</h2><p className="offer-intro">{active.intro}</p></div><span className="stage-label"><span className="stage-dot" />{active.stage}</span></div>
        <div className={`offer-grid offer-count-${active.items.length}`}>{active.items.map((item, index) => { const Icon = item.icon; return <article className="offer-card" key={item.title}><div className="offer-card-top"><span>{active.number}.{String(index + 1).padStart(2, '0')}</span><Icon size={20} /></div><span className="offer-type">{item.type}</span><h3>{item.title}</h3><p className="offer-description">{item.description}</p><div className="offer-card-bottom"><span className="offer-meta">{item.meta}</span><button className="text-action" onClick={() => setSelectedOffer({ item, category: active })}>POZNAJ OFERTĘ <ArrowRight size={15} /></button></div></article>; })}</div>
        <p className="stage-note"><LockKeyhole size={14} /> Katalog i opisy są przygotowane koncepcyjnie. Zakupy, płatności i aktywacja produktów wymagają osobnego wdrożenia.</p>
      </div>
    </section>

    <section className="manifesto-strip" aria-label="Założenia Systemu Formy"><span><CheckCircle2 size={15} /> WYBIERZ SWÓJ CEL</span><span><CheckCircle2 size={15} /> DZIAŁAJ WEDŁUG PLANU</span><span><CheckCircle2 size={15} /> BUDUJ KONSEKWENCJĘ</span></section>

    <section className="journey-section" id="jak-dziala"><div className="journey-copy"><p className="eyebrow muted">JAK TO MA DZIAŁAĆ</p><h2>OD WYBORU<br />DO <span>DZIAŁANIA.</span></h2><p>Docelowo zakupy, indywidualna współpraca i zakupione materiały będą uporządkowane w jednym miejscu.</p></div><div className="journey-steps"><div className="journey-step"><span>01</span><div><h3>Wybierasz</h3><p>Wyzwanie, materiał cyfrowy albo usługę dopasowaną do celu.</p></div><ChevronRight size={18} /></div><div className="journey-step"><span>02</span><div><h3>Realizujesz</h3><p>Po wdrożeniu zakupów otrzymasz właściwą instrukcję i dostęp.</p></div><ChevronRight size={18} /></div><div className="journey-step"><span>03</span><div><h3>Masz wszystko w jednym miejscu</h3><p>Strefa klienta uporządkuje dane konta, zamówienia, plany i przypisane materiały.</p></div><ChevronRight size={18} /></div></div></section>

    <section className="closing-cta"><div><p className="eyebrow"><span className="eyebrow-dot" /> ZACZNIJ OD DOBREGO WYBORU</p><h2>TWÓJ SYSTEM.<br /><span>TWOJE TEMPO.</span></h2></div><a className="secondary-button" href="#oferta">WYBIERZ KATEGORIĘ <ArrowDownRight size={18} /></a></section>
    <footer className="footer"><Brand /><p className="footer-motto">RUSZAJ. BUDUJ. POWTARZAJ.</p><nav className="footer-legal" aria-label="Dokumenty prawne"><button onClick={() => setLegalPage('terms')}>Regulamin</button><span>·</span><button onClick={() => setLegalPage('privacy')}>Polityka prywatności</button></nav><span className="footer-copy">© {new Date().getFullYear()} SYSTEM FORMY</span></footer>

    {(showAccount || selectedOffer || legalPage) && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeOverlay(); }}><section className={`detail-modal${showAccount ? ' account-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={closeOverlay} aria-label="Zamknij okno"><X size={20} /></button>
      {selectedOffer && <><p className="eyebrow muted">{selectedOffer.category.label.toUpperCase()}</p><span className="modal-type">{selectedOffer.item.type}</span><h2 id="modal-title">{selectedOffer.item.title}</h2><p className="modal-description">{selectedOffer.item.description}</p><div className="modal-divider" /><p className="modal-subhead">ZAŁOŻENIA</p><ul className="detail-list">{selectedOffer.item.details.map((detail) => <li key={detail}><span />{detail}</li>)}</ul><div className="modal-notice"><LockKeyhole size={17} /><span>Ta oferta nie jest jeszcze dostępna do zakupu. To opis założeń, a nie aktywna usługa.</span></div><button className="modal-done" onClick={closeOverlay}>ROZUMIEM <ArrowUpRight size={16} /></button></>}
      {legalPage && <><p className="eyebrow muted">SYSTEM FORMY / INFORMACJE</p><h2 id="modal-title">{legalPage === 'terms' ? <>REGULAMIN<span>.</span></> : <>POLITYKA PRYWATNOŚCI<span>.</span></>}</h2><p className="modal-description">{legalPage === 'terms' ? 'Treść regulaminu jest w przygotowaniu. Przed uruchomieniem sprzedaży należy opublikować pełne zasady zakupów, płatności, dostępu do produktów, odstąpienia od umowy i reklamacji.' : 'Treść polityki prywatności jest w przygotowaniu. Przed uruchomieniem rejestracji i sprzedaży należy opisać administratora danych, cele i podstawy przetwarzania, okresy przechowywania, prawa użytkownika oraz używane usługi.'}</p><div className="modal-notice"><ShieldCheck size={17} /><span>To tymczasowy komunikat informacyjny, a nie dokument prawny. Nie uruchamiaj płatnej sprzedaży przed uzupełnieniem treści.</span></div><button className="modal-done" onClick={closeOverlay}>ZAMKNIJ <ArrowUpRight size={16} /></button></>}
      {showAccount && <><div className="account-modal-heading"><p className="eyebrow muted">SYSTEM FORMY / STREFA KLIENTA</p><div className="modal-account-icon">{accountMode === 'recovery' ? <Mail size={24} /> : accountMode === 'dashboard' ? <UserRound size={24} /> : <LockKeyhole size={24} />}</div><h2 id="modal-title">{accountMode === 'dashboard' ? <>TWOJE KONTO<span>.</span></> : <>{accountTitle.split('.')[0]}<span>.</span></>}</h2><p className="modal-description">{accountMode === 'dashboard' ? `Zalogowano jako ${currentUser?.email ?? 'użytkownik'}.` : accountMode === 'signup' ? 'Utwórz konto, aby w przyszłości mieć w jednym miejscu swoje materiały i statusy usług.' : accountMode === 'recovery' ? 'Ze względów bezpieczeństwa zmiana hasła jest obsługiwana ręcznie przez właściciela Systemu Formy.' : 'Zaloguj się, aby przejść do swojej strefy klienta.'}</p></div>
        {accountMode === 'dashboard' && currentUser ? <div className="customer-dashboard"><div className="account-toolbar"><div><span className="dashboard-label">STATUS SESJI</span><strong><span className="online-dot" /> ZALOGOWANO</strong></div><button className="signout-button" onClick={() => void signOut()} disabled={busy}><LogOut size={15} /> WYLOGUJ</button></div>
          {overview === null ? <p className="dashboard-loading">Ładowanie danych konta…</p> : <><div className="dashboard-section"><div className="dashboard-section-heading"><ShoppingBag size={18} /><h3>MOJE ZAMÓWIENIA</h3></div>{overview.orders.length ? <div className="account-list">{overview.orders.map((order) => <div className="account-list-row" key={order.id}><div><strong>{order.order_number}</strong><span>{formatDate(order.created_at)} · {order.status}</span></div><b>{formatPrice(order.total_amount, order.currency)}</b></div>)}</div> : <p className="empty-state">Nie ma jeszcze zamówień na tym koncie. Płatności nie są jeszcze podłączone.</p>}</div>
          <div className="dashboard-section"><div className="dashboard-section-heading"><BookOpen size={18} /><h3>ZAKUPIONE MATERIAŁY</h3></div>{overview.entitlements.length ? <div className="account-list">{overview.entitlements.map((entry) => <div className="account-list-row" key={entry.id}><div><strong>{entry.product_title}</strong><span>{entry.product_type} · {entry.access_status}</span></div><span className="entitlement-date">{formatDate(entry.created_at)}</span></div>)}</div> : <p className="empty-state">Zakupione materiały pojawią się tu po wdrożeniu płatności i przypisywania produktów.</p>}</div>
          <div className="dashboard-section"><div className="dashboard-section-heading"><ClipboardList size={18} /><h3>INDYWIDUALNE PLANY</h3></div>{overview.planRequests.length ? <div className="account-list">{overview.planRequests.map((entry) => <div className="account-list-row" key={entry.id}><div><strong>Indywidualny plan</strong><span>Dodano: {formatDate(entry.created_at)}</span></div><span className="status-pill">{entry.status}</span></div>)}</div> : <p className="empty-state">Status realizacji planu pojawi się tutaj po wdrożeniu zamówienia i ankiety.</p>}</div></>}
        </div> : accountMode === 'recovery' ? <div className="auth-form recovery-contact">
          <div className="modal-notice"><Mail size={18} /><span>Nie możesz samodzielnie zmienić hasła przez stronę. Napisz do właściciela Systemu Formy z adresu e-mail przypisanego do konta. Po ręcznej weryfikacji otrzymasz dalsze instrukcje.</span></div>
          <a className="auth-submit recovery-mail-link" href="mailto:Jakub.gabriel2002@gmail.com?subject=System%20Formy%20%E2%80%94%20pro%C5%9Bba%20o%20odzyskanie%20dost%C4%99pu&body=Cze%C5%9B%C4%87%2C%20prosz%C4%99%20o%20pomoc%20w%20odzyskaniu%20dost%C4%99pu%20do%20konta%20Systemu%20Formy.%0AAdres%20e-mail%20konta%3A%20">NAPISZ E-MAIL <ArrowUpRight size={16} /></a>
          <p className="recovery-address">Adres kontaktowy: <a href="mailto:Jakub.gabriel2002@gmail.com">Jakub.gabriel2002@gmail.com</a></p>
          <p className="privacy-note"><ShieldCheck size={13} /> Nigdy nie wysyłaj hasła w wiadomości e-mail. Podaj tylko adres konta i opisz problem.</p>
          <div className="auth-links"><button type="button" onClick={() => switchMode('login')}>Wróć do logowania</button></div>
        </div> : <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
          <label className="field-label">ADRES E-MAIL<input type="email" name="email" autoComplete="email" placeholder="ty@przyklad.pl" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {(accountMode === 'login' || accountMode === 'signup') && <label className="field-label">HASŁO<input type="password" name="password" autoComplete={accountMode === 'login' ? 'current-password' : 'new-password'} placeholder="Minimum 10 znaków" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
          {accountMode === 'signup' && <label className="field-label">POWTÓRZ HASŁO<input type="password" name="passwordAgain" autoComplete="new-password" placeholder="Wpisz hasło ponownie" minLength={10} value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} required /></label>}
          {error && <div className="form-feedback is-error" role="alert">{error}</div>}{message && <div className="form-feedback is-success" role="status">{message}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !authReady}>{busy ? 'CHWILA…' : accountMode === 'login' ? 'ZALOGUJ SIĘ' : 'UTWÓRZ KONTO'} <ArrowUpRight size={16} /></button>
          <div className="auth-links">{accountMode === 'login' ? <><button type="button" onClick={() => switchMode('recovery')}>Nie pamiętam hasła</button><button type="button" onClick={() => switchMode('signup')}>Utwórz konto</button></> : <button type="button" onClick={() => switchMode('login')}>Wróć do logowania</button>}</div>
          <p className="privacy-note"><LockKeyhole size={13} /> Hasła są haszowane po stronie Workera. Sesję przechowuje bezpieczne ciasteczko HttpOnly.</p>
        </form>}
        {accountMode === 'dashboard' && <>{error && <div className="form-feedback is-error" role="alert">{error}</div>}{message && <div className="form-feedback is-success" role="status">{message}</div>}</>}
      </>}
    </section></div>}
  </main>;
}
