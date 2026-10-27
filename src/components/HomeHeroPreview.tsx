import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
} from 'lucide-react';

/**
 * Static, illustrative preview of the client app used on the public landing page.
 * It intentionally shows a demo layout, not real user statistics.
 */
export default function HomeHeroPreview() {
  const days = [
    { label: 'PON', number: '01', kind: 'completed' },
    { label: 'WT', number: '02', kind: 'completed' },
    { label: 'ŚR', number: '03', kind: 'rest' },
    { label: 'CZW', number: '04', kind: 'active' },
    { label: 'PT', number: '05', kind: 'rest' },
  ];

  return (
    <div className="sf-hero-visual sf-hero-app-visual" aria-label="Podgląd aplikacji System Formy">
      <div className="sf-preview-glow" aria-hidden="true" />
      <div className="sf-preview-window">
        <header className="sf-preview-header">
          <span className="sf-preview-mark">SF</span>
          <span className="sf-preview-brand-copy">
            <small>SYSTEM FORMY</small>
            <b>Twój pulpit</b>
          </span>
          <span className="sf-preview-demo-pill">PODGLĄD</span>
        </header>

        <div className="sf-preview-welcome">
          <p className="sf-eyebrow">TWÓJ TYGODNIOWY RYTM</p>
          <h2>Małe kroki. Stały progres.</h2>
          <p>Jasny plan działania, bez zgadywania co dalej.</p>
        </div>

        <div className="sf-preview-week" aria-label="Przykładowy tydzień treningowy">
          {days.map((day) => (
            <div className={`sf-preview-day is-${day.kind}`} key={day.label}>
              <small>{day.label}</small>
              <b>{day.kind === 'completed' ? <CheckCircle2 size={16} /> : day.number}</b>
              <span>{day.kind === 'completed' ? 'Gotowe' : day.kind === 'active' ? 'Plan' : 'Przerwa'}</span>
            </div>
          ))}
        </div>

        <div className="sf-preview-plan-card">
          <div className="sf-preview-plan-heading">
            <span className="sf-preview-icon"><Dumbbell size={17} /></span>
            <span><small>PRZYKŁADOWY PLAN</small><b>Trening całego ciała</b></span>
            <ArrowRight size={16} />
          </div>
          <div className="sf-preview-exercise-lines" aria-hidden="true">
            <i /><i /><i />
          </div>
        </div>

        <div className="sf-preview-shortcuts">
          <div><BarChart3 size={16} /><span>Postępy</span></div>
          <div><BookOpen size={16} /><span>Materiały</span></div>
          <div><CalendarDays size={16} /><span>Wyzwania</span></div>
        </div>
      </div>

      <div className="sf-preview-floating sf-preview-floating-top">
        <span><Activity size={16} /></span>
        <div><small>TWÓJ PROCES</small><b>Wszystko w jednym miejscu</b></div>
      </div>
      <div className="sf-preview-floating sf-preview-floating-bottom">
        <span><CheckCircle2 size={16} /></span>
        <div><small>NASTĘPNY KROK</small><b>Wiesz, co robić dalej</b></div>
      </div>
    </div>
  );
}
