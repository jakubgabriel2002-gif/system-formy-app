import { CheckCircle2, Dumbbell, ListChecks, RotateCcw } from "lucide-react";
import type { WorkoutExercise } from "./workoutTypes";

type Props = {
  title: string;
  durationLabel?: string;
  exercises: WorkoutExercise[];
  onBackToDashboard: () => void;
  onStartAnother: () => void;
};

export default function WorkoutSummary({
  title,
  durationLabel,
  exercises,
  onBackToDashboard,
  onStartAnother,
}: Props) {
  const setCount = exercises.reduce((sum, exercise) => sum + exercise.sets_detail.length, 0);
  const completedSets = exercises.reduce((sum, exercise) => sum + exercise.sets_detail.filter((set) => set.completed).length, 0);
  const volume = exercises.reduce((sum, exercise) => sum + exercise.sets_detail.reduce((setSum, set) => {
    if (set.weight_kg == null || !Number.isFinite(set.weight_kg) || !Number.isFinite(set.reps)) return setSum;
    return setSum + set.weight_kg * set.reps;
  }, 0), 0);

  return (
    <section className="sf-workout-mode sf-wm-summary">
      <div className="sf-wm-summary-icon"><CheckCircle2 size={34} /></div>
      <p className="sf-wm-eyebrow">DOBRA ROBOTA</p>
      <h1>Trening zakończony.</h1>
      <p className="sf-wm-summary-subtitle">{title}</p>
      <div className="sf-wm-summary-stats">
        <article><ListChecks size={20} /><strong>{completedSets}/{setCount}</strong><span>Wykonane serie</span></article>
        <article><Dumbbell size={20} /><strong>{exercises.length}</strong><span>Ćwiczenia</span></article>
        <article><RotateCcw size={20} /><strong>{Math.round(volume).toLocaleString("pl-PL")} kg</strong><span>Objętość z wpisanych serii*</span></article>
      </div>
      {durationLabel && <p className="sf-wm-summary-duration">Czas treningu: {durationLabel}</p>}
      <div className="sf-wm-summary-exercises">
        {exercises.map((exercise, index) => (
          <div key={`${exercise.name}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{exercise.name}</strong>
            <small>{exercise.sets_detail.filter((set) => set.completed).length}/{exercise.sets_detail.length} serii</small>
          </div>
        ))}
      </div>
      <p className="sf-wm-summary-footnote">* Objętość to suma ciężar × powtórzenia dla serii z wpisanym ciężarem. To metryka pomocnicza, nie miara całego wysiłku.</p>
      <div className="sf-wm-summary-actions">
        <button className="sf-wm-button sf-wm-button-secondary" onClick={onBackToDashboard}>Wróć do panelu</button>
        <button className="sf-wm-button sf-wm-button-primary" onClick={onStartAnother}>Kolejny trening</button>
      </div>
    </section>
  );
}
