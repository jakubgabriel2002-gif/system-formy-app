import {
  ArrowUpRight,
  Dumbbell,
  Flame,
  Sparkles
} from 'lucide-react';

const challenges = [
  {
    number: '01',
    title: 'Zbuduj nawyk',
    description:
      'Zacznij regularnie trenować i uporządkuj swój tydzień.',
    tag: 'START',
    icon: Flame
  },
  {
    number: '02',
    title: 'Trenuj w domu',
    description:
      'Wykorzystaj to, co masz pod ręką. Trenuj we własnym tempie.',
    tag: 'DOM',
    icon: Dumbbell
  },
  {
    number: '03',
    title: 'Wejdź poziom wyżej',
    description:
      'Podejdź do treningu z planem i konsekwencją.',
    tag: 'ROZWÓJ',
    icon: Sparkles
  }
];

export default function App() {
  return (
    <main className="shell">
      <nav className="topbar">
        <a className="brand" href="#" aria-label="System Formy">
          <span className="mark">SF</span>
          <span>SYSTEM <b>FORMY</b></span>
        </a>

        <a className="nav-link" href="#konto">
          KONTO <ArrowUpRight size={16} />
        </a>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span className="dot" />
          TWOJA DROGA. TWÓJ SYSTEM.
        </div>

        <h1>
          FORMA NIE ROBI SIĘ <span>SAMA.</span>
        </h1>

        <p className="hero-copy">
          Mniej chaosu. Więcej konsekwencji. Wybierz wyzwanie
          i buduj formę krok po kroku — we własnym tempie.
        </p>

        <a className="primary-button" href="#wyzwania">
          WYBIERAM WYZWANIE <ArrowUpRight size={18} />
        </a>

        <p className="note">
          JASNE CELE. REGULARNOŚĆ. TWÓJ POSTĘP.
        </p>

        <span className="hero-index">SF / 001</span>
      </section>

      <section className="challenges" id="wyzwania">
        <div className="section-heading">
          <div>
            <p className="eyebrow muted">ZACZNIJ TUTAJ</p>
            <h2>
              WYBIERZ SWÓJ <span>KIERUNEK.</span>
            </h2>
          </div>

          <p className="section-copy">
            Wyzwania, które pomagają zbudować regularność
            i ruszyć z miejsca.
          </p>
        </div>

        <div className="grid">
          {challenges.map(
            ({ number, title, description, tag, icon: Icon }) => (
              <article className="challenge-card" key={number}>
                <div className="card-top">
                  <span>{number} / WYZWANIE</span>
                  <Icon size={21} />
                </div>

                <span className="tag">{tag}</span>
                <h3>{title}</h3>
                <p>{description}</p>

                <a className="card-link" href="#konto">
                  POZNAJ SZCZEGÓŁY <ArrowUpRight size={16} />
                </a>
              </article>
            )
          )}
        </div>
      </section>

      <section className="account" id="konto">
        <div>
          <p className="eyebrow muted">KOLEJNY KROK</p>
          <h2>
            TWÓJ SYSTEM<br />
            <span>ZACZYNA SIĘ TUTAJ.</span>
          </h2>
        </div>

        <p>
          Strefa użytkownika, rejestracja i zakup wyzwań
          zostaną podłączone w kolejnych etapach.
        </p>

        <a className="secondary-button" href="#wyzwania">
          ZOBACZ WYZWANIA <ArrowUpRight size={17} />
        </a>
      </section>

      <footer>
        <a className="brand" href="#" aria-label="System Formy">
          <span className="mark">SF</span>
          <span>SYSTEM <b>FORMY</b></span>
        </a>

        <span>RUSZAJ. BUDUJ. POWTARZAJ.</span>
        <span>© {new Date().getFullYear()} SYSTEM FORMY</span>
      </footer>
    </main>
  );
}
