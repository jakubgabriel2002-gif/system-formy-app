import { ArrowRight, Clock3, Dumbbell, Play, RotateCcw } from 'lucide-react';
import type { WorkoutDraft, WorkoutPlan } from './workoutTypes';

type Props = {
  plans: WorkoutPlan[];
  activeDraft?: WorkoutDraft | null;
  loading?: boolean;
  onStart: (plan: WorkoutPlan, dayKey: string) => void;
  onResume: () => void;
  onGoToPlans: () => void;
};

export default function WorkoutLanding({
  plans, activeDraft, loading = false, onStart, onResume, onGoToPlans,
}: Props) {
  const hasActiveDraft = Boolean(activeDraft?.started && activeDraft.plan_id);
  const ownPlans = plans.filter((plan) => !plan.id.startsWith('sample:'));
  const samplePlans = plans.filter((plan) => plan.id.startsWith('sample:'));

  return (
    <section className="sf-workout-mode">
      <header className="sf-wm-heading">
        <p className="sf-wm-eyebrow">CENTRUM TRENINGOWE</p>
        <h1>Trening zaczyna się tutaj.</h1>
        <p>Wybierz własny plan lub skorzystaj z przykładowego treningu. Zapisuj wynik każdej serii na bieżąco.</p>
      </header>

      {hasActiveDraft && (
        <article className="sf-wm-resume">
          <div className="sf-wm-resume-icon"><RotateCcw size={22} /></div>
          <div className="sf-wm-resume-copy">
            <span>MASZ ROZPOCZĘTY TRENING</span>
            <h2>{activeDraft?.title || 'Trening w toku'}</h2>
            <p>Wróć do miejsca, w którym skończyłeś. Zapis roboczy jest oddzielony od historii ukończonych treningów.</p>
          </div>
          <button className="sf-wm-button sf-wm-button-primary" onClick={onResume} disabled={loading}>
            Wznów trening <ArrowRight size={16} />
          </button>
        </article>
      )}

      {ownPlans.length === 0 ? (
        <article className="sf-wm-empty">
          <Dumbbell size={28} />
          <h2>Ustal swój trening</h2>
          <p>Nie masz jeszcze własnego planu. Utwórz go w kreatorze albo wybierz jeden z treningów przykładowych poniżej.</p>
          <button className="sf-wm-button sf-wm-button-primary" onClick={onGoToPlans}>Ustal swój trening <ArrowRight size={16} /></button>
        </article>
      ) : (
        <>
          <div className="sf-wm-plan-section-heading">
            <h2>Twoje plany</h2>
            <button className="sf-wm-text-button" onClick={onGoToPlans}>Ustal / edytuj plan <ArrowRight size={15} /></button>
          </div>
          <div className="sf-wm-plan-grid">
            {ownPlans.map((plan) => (
              <article className="sf-wm-plan-card" key={plan.id}>
                <div className="sf-wm-plan-top">
                  <div className="sf-wm-plan-icon"><Dumbbell size={20} /></div>
                  <span>{plan.days.length} {plan.days.length === 1 ? 'dzień' : 'dni'}</span>
                </div>
                <h2>{plan.name}</h2>
                {plan.description && <p className="sf-wm-plan-description">{plan.description}</p>}
                <div className="sf-wm-day-list">
                  {plan.days.map((day, index) => (
                    <div className="sf-wm-day-row" key={`${plan.id}-${day.day_key}-${index}`}>
                      <div>
                        <strong>{day.title || `Dzień ${day.day_key}`}</strong>
                        <span><Clock3 size={13} /> {day.exercises.length} ćwiczeń</span>
                      </div>
                      <button className="sf-wm-icon-button" aria-label={`Rozpocznij ${day.title || `dzień ${day.day_key}`}`}
                        title="Rozpocznij trening" disabled={loading || !day.exercises.some((exercise) => exercise.name.trim())}
                        onClick={() => onStart(plan, day.day_key)}>
                        <Play size={16} fill="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="sf-wm-plan-section-heading sf-wm-sample-heading">
        <h2>Treningi przykładowe</h2>
        <span>Możesz zacząć bez zapisywania własnego planu</span>
      </div>
      <div className="sf-wm-plan-grid">
        {samplePlans.map((plan) => (
          <article className="sf-wm-plan-card sf-wm-sample-card" key={plan.id}>
            <div className="sf-wm-plan-top">
              <div className="sf-wm-plan-icon"><Dumbbell size={20} /></div>
              <span>{plan.id === 'sample:home' ? 'BEZ SPRZĘTU' : 'SIŁOWNIA'}</span>
            </div>
            <h2>{plan.name}</h2>
            {plan.description && <p className="sf-wm-plan-description">{plan.description}</p>}
            {plan.days.map((day) => (
              <div className="sf-wm-day-row" key={day.day_key}>
                <div>
                  <strong>{day.title}</strong>
                  <span><Clock3 size={13} /> {day.exercises.length} ćwiczeń</span>
                </div>
                <button className="sf-wm-icon-button" aria-label={`Rozpocznij ${day.title}`} title="Rozpocznij trening"
                  disabled={loading} onClick={() => onStart(plan, day.day_key)}>
                  <Play size={16} fill="currentColor" />
                </button>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
