import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Crown,
  Dumbbell,
  FileText,
  Flame,
  Headphones,
  LockKeyhole,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';

type CategoryKey =
  | 'wyzwania'
  | 'produkty'
  | 'plan'
  | 'prowadzenie'
  | 'program'
  | 'premium';

type OfferItem = {
  title: string;
  type: string;
  description: string;
  meta: string;
  icon: typeof Dumbbell;
  details: string[];
};

type Category = {
  key: CategoryKey;
  number: string;
  label: string;
  shortLabel: string;
  headline: string;
  intro: string;
  summary: string;
  icon: typeof Dumbbell;
  stage: string;
  items: OfferItem[];
};

const categories: Category[] = [
  {
    key: 'wyzwania',
    number: '01',
    label: 'Wyzwania treningowe',
    shortLabel: 'Wyzwania',
    headline: 'KONKRETNY CEL. OKREŚLONY CZAS.',
    intro:
      'Gotowe programy treningowe zaprojektowane wokół jednego celu i jasno określonego czasu trwania.',
    summary: 'Gotowe programy z celem i czasem trwania.',
    icon: Flame,
    stage: 'KATALOG W PRZYGOTOWANIU',
    items: [
      {
        title: 'Duża klata w domu',
        type: 'WYZWANIE TRENINGOWE',
        description: 'Koncepcja programu ukierunkowanego na trening klatki piersiowej w warunkach domowych.',
        meta: '12 TYGODNI',
        icon: Dumbbell,
        details: [
          'Trening w domu jako główne założenie programu.',
          'Jasno określony czas trwania: 12 tygodni.',
          'Szczegółowy harmonogram i zawartość programu wymagają przygotowania przed uruchomieniem sprzedaży.',
        ],
      },
      {
        title: '30 dni regularności',
        type: 'WYZWANIE TRENINGOWE',
        description: 'Koncepcja programu, który pomaga zbudować nawyk regularnego podejmowania aktywności.',
        meta: '30 DNI',
        icon: Flame,
        details: [
          'Główny cel: wypracowanie regularności.',
          'Jasno określony czas trwania: 30 dni.',
          'Konkretne treningi, plan tygodnia i materiały trzeba uzupełnić przed sprzedażą.',
        ],
      },
      {
        title: 'Budowanie siły',
        type: 'WYZWANIE TRENINGOWE',
        description: 'Koncepcja programu nastawionego na rozwijanie siły w uporządkowanym cyklu.',
        meta: '8 TYGODNI',
        icon: Sparkles,
        details: [
          'Główny cel: rozwój siły.',
          'Jasno określony czas trwania: 8 tygodni.',
          'Dobór ćwiczeń, progresja i poziomy zaawansowania wymagają dopracowania.',
        ],
      },
    ],
  },
  {
    key: 'produkty',
    number: '02',
    label: 'Produkty cyfrowe',
    shortLabel: 'Produkty cyfrowe',
    headline: 'WIEDZA, DO KTÓREJ WRACASZ.',
    intro:
      'E-booki, poradniki i inne materiały cyfrowe sprzedawane niezależnie od wyzwań i subskrypcji.',
    summary: 'E-booki, poradniki i materiały cyfrowe.',
    icon: BookOpen,
    stage: 'KATALOG W PRZYGOTOWANIU',
    items: [
      {
        title: 'E-booki treningowe',
        type: 'PRODUKT CYFROWY',
        description: 'Materiały do samodzielnego wykorzystania, dostępne po zakupie na zasadach określonych dla danego produktu.',
        meta: 'DO POBRANIA',
        icon: BookOpen,
        details: [
          'Osobna kategoria produktów, niezależna od wyzwań treningowych.',
          'Po zakupie produkt powinien być przypisany do konta klienta.',
          'Konkretne tytuły, pliki, ceny i warunki dostępu zostaną dodane po przygotowaniu oferty.',
        ],
      },
      {
        title: 'Poradniki i materiały',
        type: 'PRODUKT CYFROWY',
        description: 'Dodatkowe materiały edukacyjne, które nie muszą stanowić pełnego programu treningowego.',
        meta: 'DOSTĘP PO ZAKUPIE',
        icon: FileText,
        details: [
          'Poradniki pozostają oddzielone od gotowych programów treningowych.',
          'Dostęp do zakupionych materiałów ma wynikać z zakupu, a nie z aktywnej subskrypcji Premium.',
          'Lista materiałów i formatów jest jeszcze do uzupełnienia.',
        ],
      },
    ],
  },
  {
    key: 'plan',
    number: '03',
    label: 'Indywidualny plan treningowy',
    shortLabel: 'Plan indywidualny',
    headline: 'PLAN DOPASOWANY DO CIEBIE.',
    intro:
      'Jednorazowa usługa przygotowania planu dla konkretnej osoby — z zamówieniem, ankietą i realizacją po zakupie.',
    summary: 'Jednorazowa usługa przygotowywana dla klienta.',
    icon: ClipboardList,
    stage: 'PROCES DO WDROŻENIA',
    items: [
      {
        title: 'Twój indywidualny plan',
        type: 'USŁUGA INDYWIDUALNA',
        description: 'Klient składa zamówienie, opłaca usługę i wypełnia ankietę. Plan przygotowujesz i przypisujesz do jego konta.',
        meta: 'PLAN PRZYGOTOWYWANY INDYWIDUALNIE',
        icon: ClipboardList,
        details: [
          '1. Zamówienie i płatność na stronie.',
          '2. Ankieta klienta po zakupie.',
          '3. Status realizacji: oczekuje na ankietę, w przygotowaniu, gotowy lub anulowany / zwrócony.',
          '4. Gotowy plan przypisany do konta klienta.',
        ],
      },
    ],
  },
  {
    key: 'prowadzenie',
    number: '04',
    label: 'Prowadzenie online',
    shortLabel: 'Prowadzenie online',
    headline: 'WSPÓŁPRACA, NIE TYLKO PLAN.',
    intro:
      'Osobna usługa zdalnego prowadzenia. Jej zakres, czas trwania i sposób kontaktu zostaną opisane w ofercie przed uruchomieniem.',
    summary: 'Osobna usługa zdalnej współpracy.',
    icon: Headphones,
    stage: 'ZAKRES DO USTALENIA',
    items: [
      {
        title: 'Prowadzenie online',
        type: 'USŁUGA WSPÓŁPRACY',
        description: 'Dłuższa współpraca zdalna, oddzielona od jednorazowego przygotowania indywidualnego planu.',
        meta: 'SZCZEGÓŁY WKRÓTCE',
        icon: Headphones,
        details: [
          'Prowadzenie online jest osobną usługą, a nie inną nazwą indywidualnego planu.',
          'Zakres kontaktu, czas trwania, aktualizacje i cena wymagają określenia.',
          'System powinien obsługiwać status klienta i informacje o aktywnej współpracy.',
        ],
      },
    ],
  },
  {
    key: 'program',
    number: '05',
    label: 'Program Systemu Formy',
    shortLabel: 'Program Systemu Formy',
    headline: 'FLAGOWA OFERTA SYSTEMU FORMY.',
    intro:
      'Osobny program o wyższej wartości, pozycjonowany jako główna, rozbudowana oferta marki.',
    summary: 'Flagowy produkt o wyższej wartości.',
    icon: Crown,
    stage: 'OFERTA DO OPRACOWANIA',
    items: [
      {
        title: 'Program Systemu Formy',
        type: 'OFERTA FLAGOWA',
        description: 'Wyróżniony produkt marki z własnym opisem, zakresem, ceną i ścieżką klienta.',
        meta: 'OFERTA PREMIUM / HIGH-TICKET',
        icon: Crown,
        details: [
          'Program jest odrębnym produktem — nie należy utożsamiać go z subskrypcją Premium.',
          'Zakres, długość programu, cena i sposób realizacji nie zostały jeszcze określone.',
          'Po zatwierdzeniu założeń oferta otrzyma własną stronę produktu i ścieżkę zakupu.',
        ],
      },
    ],
  },
  {
    key: 'premium',
    number: '06',
    label: 'Premium',
    shortLabel: 'Premium',
    headline: 'SUBSKRYPCJA. DODATKOWE MOŻLIWOŚCI.',
    intro:
      'Abonament dający dostęp do określonych funkcji i materiałów Premium. Nie zastępuje zakupionych produktów jednorazowych.',
    summary: 'Subskrypcja do funkcji i treści Premium.',
    icon: LockKeyhole,
    stage: 'ZAKRES DO USTALENIA',
    items: [
      {
        title: 'Dostęp Premium',
        type: 'SUBSKRYPCJA',
        description: 'Odnawialny dostęp do funkcji i materiałów objętych subskrypcją, zgodnie z warunkami abonamentu.',
        meta: 'MODEL SUBSKRYPCYJNY',
        icon: LockKeyhole,
        details: [
          'Lista funkcji i materiałów dostępnych w Premium musi zostać określona.',
          'Po zakończeniu subskrypcji wygasa dostęp do elementów zależnych od Premium.',
          'Produkty cyfrowe kupione osobno mają pozostać dostępne zgodnie z warunkami zakupu, niezależnie od zakończenia subskrypcji.',
        ],
      },
    ],
  },
];

type ModalState =
  | { type: 'offer'; item: OfferItem; category: Category }
  | { type: 'account' }
  | null;

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="System Formy — strona główna">
      <span className="brand-mark">SF</span>
      <span className="brand-wordmark">SYSTEM <b>FORMY</b></span>
    </a>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('wyzwania');
  const [modal, setModal] = useState<ModalState>(null);
  const active = categories.find((category) => category.key === activeCategory) ?? categories[0];
  const ActiveIcon = active.icon;

  const chooseCategory = (key: CategoryKey) => {
    setActiveCategory(key);
    document.getElementById('oferta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="Główna nawigacja">
          <a href="#linie-oferty">OFERTA</a>
          <a href="#jak-dziala">JAK TO DZIAŁA</a>
        </nav>
        <button className="account-button" onClick={() => setModal({ type: 'account' })}>
          <UserRound size={16} /> <span>STREFA KLIENTA</span> <ArrowUpRight size={15} />
        </button>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> TWOJA DROGA. TWÓJ SYSTEM.</div>
          <h1 id="hero-title">FORMA NIE ROBI SIĘ <span>SAMA.</span></h1>
          <p className="hero-copy">
            Mniej chaosu. Więcej konsekwencji. Wybierz rozwiązanie, które pasuje do Twojego celu —
            od gotowego wyzwania po indywidualną współpracę.
          </p>
          <a className="primary-button" href="#linie-oferty">
            POZNAJ MOŻLIWOŚCI <ArrowUpRight size={17} />
          </a>
          <div className="hero-footnote"><span>01 / 06</span> JASNY KIERUNEK. REALNY PLAN. SYSTEMATYCZNOŚĆ.</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-ring art-ring-one" />
          <div className="art-ring art-ring-two" />
          <div className="art-crosshair">+</div>
          <div className="art-word">SF<span>.</span></div>
          <div className="art-caption">BUILT WITH<br />DISCIPLINE</div>
          <div className="art-line" />
        </div>
      </section>

      <section className="manifesto-strip" aria-label="Założenia Systemu Formy">
        <span><CheckCircle2 size={15} /> WYBIERZ SWÓJ CEL</span>
        <span><CheckCircle2 size={15} /> DZIAŁAJ WEDŁUG PLANU</span>
        <span><CheckCircle2 size={15} /> BUDUJ KONSEKWENCJĘ</span>
      </section>

      <section className="lines-section" id="linie-oferty">
        <div className="section-heading">
          <div>
            <p className="eyebrow muted">SYSTEM FORMY / OFERTA</p>
            <h2>JEDNA MARKA.<br /><span>SZEŚĆ DRÓG.</span></h2>
          </div>
          <p className="section-intro">
            Każda forma współpracy ma inne zadanie. Wybierz kategorię i poznaj jej założenia.
          </p>
        </div>

        <div className="category-grid">
          {categories.map((category) => {
            const Icon = category.icon;
            const isActive = category.key === activeCategory;
            return (
              <button
                className={`category-card${isActive ? ' is-active' : ''}`}
                key={category.key}
                onClick={() => chooseCategory(category.key)}
                aria-pressed={isActive}
              >
                <div className="category-card-top"><span>{category.number} / 06</span><Icon size={21} /></div>
                <h3>{category.label}</h3>
                <p>{category.summary}</p>
                <span className="category-open">ZOBACZ KATEGORIĘ <ArrowUpRight size={15} /></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="offer-section" id="oferta">
        <div className="offer-heading">
          <div className="offer-title-icon"><ActiveIcon size={22} /></div>
          <div>
            <p className="eyebrow muted">KATEGORIA {active.number} / 06</p>
            <h2>{active.headline}</h2>
            <p className="offer-intro">{active.intro}</p>
          </div>
          <span className="stage-label"><span className="stage-dot" /> {active.stage}</span>
        </div>

        <div className={`offer-grid offer-count-${active.items.length}`}>
          {active.items.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className="offer-card" key={item.title}>
                <div className="offer-card-top">
                  <span>{active.number}.{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={20} />
                </div>
                <span className="offer-type">{item.type}</span>
                <h3>{item.title}</h3>
                <p className="offer-description">{item.description}</p>
                <div className="offer-card-bottom">
                  <span className="offer-meta">{item.meta}</span>
                  <button className="text-action" onClick={() => setModal({ type: 'offer', item, category: active })}>
                    POZNAJ ZAŁOŻENIA <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="stage-note">
          <LockKeyhole size={14} /> To etap budowy katalogu. Zakupy i aktywacja usług nie są jeszcze dostępne na stronie.
        </p>
      </section>

      <section className="journey-section" id="jak-dziala">
        <div className="journey-copy">
          <p className="eyebrow muted">JAK TO MA DZIAŁAĆ</p>
          <h2>OD WYBORU<br />DO <span>DZIAŁANIA.</span></h2>
          <p>Docelowo zakupy, indywidualna współpraca i zakupione materiały będą uporządkowane w jednym miejscu.</p>
        </div>
        <div className="journey-steps">
          <div className="journey-step"><span>01</span><div><h3>Wybierasz</h3><p>Wyzwanie, materiał cyfrowy albo usługę dopasowaną do celu.</p></div><ChevronRight size={18} /></div>
          <div className="journey-step"><span>02</span><div><h3>Realizujesz</h3><p>Po wdrożeniu zakupów otrzymasz właściwą instrukcję i dostęp.</p></div><ChevronRight size={18} /></div>
          <div className="journey-step"><span>03</span><div><h3>Masz wszystko w jednym miejscu</h3><p>Docelowa strefa klienta uporządkuje produkty, plany i statusy usług.</p></div><ChevronRight size={18} /></div>
        </div>
      </section>

      <section className="closing-cta">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> ZACZNIJ OD DOBREGO WYBORU</p>
          <h2>TWÓJ SYSTEM.<br /><span>TWOJE TEMPO.</span></h2>
        </div>
        <a className="secondary-button" href="#linie-oferty">WYBIERZ KATEGORIĘ <ArrowDownRight size={18} /></a>
      </section>

      <footer className="footer">
        <Brand />
        <span className="footer-motto">RUSZAJ. BUDUJ. POWTARZAJ.</span>
        <span className="footer-copy">© {new Date().getFullYear()} SYSTEM FORMY</span>
      </footer>

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Zamknij okno"><X size={20} /></button>
            {modal.type === 'offer' ? (
              <>
                <p className="eyebrow muted">{modal.category.label.toUpperCase()}</p>
                <span className="modal-type">{modal.item.type}</span>
                <h2 id="modal-title">{modal.item.title}</h2>
                <p className="modal-description">{modal.item.description}</p>
                <div className="modal-divider" />
                <p className="modal-subhead">ZAŁOŻENIA</p>
                <ul className="detail-list">
                  {modal.item.details.map((detail) => <li key={detail}><span />{detail}</li>)}
                </ul>
                <div className="modal-notice"><LockKeyhole size={17} /><span>Oferta nie jest jeszcze dostępna do zakupu. Szczegóły oznaczają założenia projektu, a nie aktywną usługę.</span></div>
              </>
            ) : (
              <>
                <p className="eyebrow muted">SYSTEM FORMY / STREFA KLIENTA</p>
                <div className="modal-account-icon"><UserRound size={24} /></div>
                <h2 id="modal-title">STREFA KLIENTA<br /><span>W PRZYGOTOWANIU.</span></h2>
                <p className="modal-description">Logowanie, rejestracja, historia zamówień i dostęp do zakupionych produktów będą wdrażane w kolejnych etapach.</p>
                <div className="modal-notice"><LockKeyhole size={17} /><span>Logowanie nie jest jeszcze aktywne. Nie wpisuj tutaj hasła ani danych płatniczych.</span></div>
              </>
            )}
            <button className="modal-done" onClick={() => setModal(null)}>ROZUMIEM <ArrowUpRight size={16} /></button>
          </section>
        </div>
      )}
    </main>
  );
}
