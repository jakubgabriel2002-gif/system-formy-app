import { ArrowRight, Clock3, Dumbbell, Play, RotateCcw } from "lucide-react";
import type { WorkoutDraft, WorkoutPlan } from "./workoutTypes";

type Props = {
  plans: WorkoutPlan[];
  activeDraft?: WorkoutDraft | null;
  loading?: boolean;
  onStart: (plan: WorkoutPlan, dayKey: string) => void;
  onResume: () => void;
};

export default function WorkoutLanding({
  plans,
  activeDraft,
  loading = false,
  onStart,
  onResume,
}: Props) {
  const hasActiveDraft = Boolean(activeDraft?.started && activeDraft.plan_id);

  return (
    <section className="sf-workout-mode">
      <header className="sf-wm-heading">
        <p className="sf-wm-eyebrow">CENTRUM TRENINGOWE</p>
        <h1>Trening zaczyna się tutaj.</h1>
        <p>Wybierz plan, zrób swoje i zapisuj progres po każdej serii.</p>
      </header>

      {hasActiveDraft && (
        <article className="sf-wm-resume">
          <div className="sf-wm-resume-icon"><RotateCcw size={22} /></div>
          <div className="sf-wm-resume-copy">
            <span>MASZ ROZPOCZĘTY TRENING</span>
            <h2>{activeDraft?.title || "Trening w toku"}</h2>
            <p>Wróć do miejsca, w którym skończyłeś. Zapis roboczy pozostaje oddzielony od historii ukończonych treningów.</p>
          </div>
          <button className="sf-wm-button sf-wm-button-primary" onClick={onResume} disabled={loading}>
            Wznów trening <ArrowRight size={16} />
          </button>
        </article>
      )}

      {plans.length === 0 ? (
        <article className="sf-wm-empty">
          <Dumbbell size={28} />
          <h2>Najpierw potrzebujesz planu</h2>
          <p>Utwórz plan treningowy lub dodaj plan przykładowy, a następnie wróć tutaj, żeby rozpocząć sesję.</p>
        </article>
      ) : (
        <div className="sf-wm-plan-grid">
          {plans.map((plan) => (
            <article className="sf-wm-plan-card" key={plan.id}>
              <div className="sf-wm-plan-top">
                <div className="sf-wm-plan-icon"><Dumbbell size={20} /></div>
                <span>{plan.days.length} {plan.days.length === 1 ? "dzień" : "dni"}</span>
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
                    <button
                      className="sf-wm-icon-button"
                      aria-label={`Rozpocznij ${day.title || `dzień ${day.day_key}`}`}
                      title="Rozpocznij trening"
                      disabled={loading || !day.exercises.some((exercise) => exercise.name.trim())}
                      onClick={() => onStart(plan, day.day_key)}
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
