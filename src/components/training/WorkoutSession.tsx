import { Check, ChevronLeft, ChevronRight, Clock3, Pause, Play, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkoutExercise } from "./workoutTypes";

type Props = {
  title: string;
  elapsedLabel?: string;
  exercises: WorkoutExercise[];
  notes: string;
  saving?: boolean;
  onExercisesChange: (exercises: WorkoutExercise[]) => void;
  onNotesChange: (notes: string) => void;
  onFinish: () => void;
  onCancel: () => void;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function WorkoutSession({ title, elapsedLabel = "00:00", exercises, notes, saving = false, onExercisesChange, onNotesChange, onFinish, onCancel }: Props) {
  const [activeExercise, setActiveExercise] = useState(0);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [pendingNextExercise, setPendingNextExercise] = useState<number | null>(null);
  const [restLabel, setRestLabel] = useState("Przerwa między seriami");
  const current = exercises[activeExercise];
  const allSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets_detail.length, 0), [exercises]);
  const doneSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets_detail.filter((set) => set.completed).length, 0), [exercises]);
  const doneExercises = useMemo(() => exercises.filter((exercise) => exercise.sets_detail.length > 0 && exercise.sets_detail.every((set) => set.completed)).length, [exercises]);
  const progress = allSets ? Math.round((doneSets / allSets) * 100) : 0;
  const activeSetIndex = current ? current.sets_detail.findIndex((set) => !set.completed) : -1;
  const activeSet = current && activeSetIndex >= 0 ? current.sets_detail[activeSetIndex] : null;

  useEffect(() => {
    if (restEnd === null) { setRestSeconds(0); return; }
    const update = () => {
      const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
      setRestSeconds(left);
      if (left === 0) {
        setRestEnd(null);
        if (pendingNextExercise !== null) setActiveExercise(pendingNextExercise);
        setPendingNextExercise(null);
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [restEnd, pendingNextExercise]);

  if (!current) return <section className="sf-workout-mode"><div className="sf-wm-empty"><h2>Brak ćwiczeń w tej sesji</h2><p>Wróć do planu i dodaj co najmniej jedno ćwiczenie.</p><button className="sf-wm-button sf-wm-button-secondary" onClick={onCancel}>Wróć</button></div></section>;

  function patchSet(exerciseIndex: number, setIndex: number, patch: Partial<WorkoutExercise["sets_detail"][number]>) {
    onExercisesChange(exercises.map((exercise, i) => i !== exerciseIndex ? exercise : {
      ...exercise, sets_detail: exercise.sets_detail.map((set, j) => j === setIndex ? { ...set, ...patch } : set),
    }));
  }
  function addSet() {
    const previous = current.sets_detail[current.sets_detail.length - 1];
    onExercisesChange(exercises.map((exercise, i) => i !== activeExercise ? exercise : {
      ...exercise, sets_detail: [...exercise.sets_detail, { reps: previous?.reps ?? 10, weight_kg: previous?.weight_kg ?? null, completed: false }],
    }));
  }
  function startRest(seconds: number, label: string, nextExercise: number | null = null) {
    setRestLabel(label);
    setPendingNextExercise(nextExercise);
    setRestEnd(Date.now() + Math.max(0, seconds) * 1000);
  }
  function completeCurrentSet() {
    if (!activeSet || activeSetIndex < 0) return;
    patchSet(activeExercise, activeSetIndex, { completed: true });
    const hasNextSet = current.sets_detail.some((set, index) => index !== activeSetIndex && !set.completed);
    if (hasNextSet) {
      startRest(current.rest_seconds ?? 90, "Przerwa między seriami");
      return;
    }
    const nextExercise = exercises.findIndex((exercise, index) => index > activeExercise && exercise.sets_detail.some((set) => !set.completed));
    if (nextExercise >= 0) {
      startRest(current.transition_rest_seconds ?? 120, "Przerwa między ćwiczeniami", nextExercise);
    }
  }

  return (
    <section className="sf-workout-mode">
      <header className="sf-wm-session-header">
        <div><p className="sf-wm-eyebrow">TRENING W TOKU</p><h1>{title || "Twój trening"}</h1><p>{doneExercises} z {exercises.length} ćwiczeń ukończonych · {doneSets} z {allSets} serii</p></div>
        <button className="sf-wm-button sf-wm-button-quiet" onClick={onCancel}><X size={16} /> Zakończ później</button>
      </header>
      <div className="sf-wm-live-timer" role="timer"><span>POSTĘP TRENINGU</span><strong>{progress}%</strong></div>
      <div className="sf-wm-progress" aria-label={`Ukończono ${progress}% treningu`}><div style={{ width: `${progress}%` }} /></div>
      <div className="sf-wm-session-layout">
        <aside className="sf-wm-exercise-nav"><span className="sf-wm-label">ĆWICZENIA</span>
          {exercises.map((exercise, index) => {
            const completed = exercise.sets_detail.length > 0 && exercise.sets_detail.every((set) => set.completed);
            return <button key={`${exercise.name}-${index}`} className={`sf-wm-exercise-nav-item ${index === activeExercise ? "is-active" : ""}`} onClick={() => { setRestEnd(null); setPendingNextExercise(null); setActiveExercise(index); }}>
              <span className="sf-wm-exercise-index">{completed ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
              <span className="sf-wm-exercise-nav-name">{exercise.name}</span><small>{exercise.sets_detail.filter((set) => set.completed).length}/{exercise.sets_detail.length}</small>
            </button>;
          })}
        </aside>
        <div className="sf-wm-session-main">
          <article className="sf-wm-current-exercise sf-wm-register-card">
            <div className="sf-wm-current-meta"><span>ĆWICZENIE {String(activeExercise + 1).padStart(2, "0")} / {String(exercises.length).padStart(2, "0")}</span><span>{current.sets_detail.length} serii</span></div>
            <h2>{current.name}</h2>
            {restEnd !== null ? (
              <div className="sf-wm-rest-focus">
                <span className="sf-wm-label"><Clock3 size={15} /> {restLabel.toUpperCase()}</span>
                <strong className="sf-wm-rest-countdown">{clock(restSeconds)}</strong>
                <p>Odpocznij. Po zakończeniu przerwy przejdziesz do kolejnej serii lub ćwiczenia.</p>
                <div className="sf-wm-rest-actions"><button className="sf-wm-button sf-wm-button-secondary" onClick={() => setRestEnd(Date.now() + (restSeconds + 30) * 1000)}>Dodaj 30 s</button><button className="sf-wm-button sf-wm-button-primary" onClick={() => { setRestEnd(null); if (pendingNextExercise !== null) setActiveExercise(pendingNextExercise); setPendingNextExercise(null); }}>Pomiń przerwę <ChevronRight size={16}/></button></div>
              </div>
            ) : activeSet ? (
              <>
                <div className="sf-wm-register-heading"><div><span className="sf-wm-label">ZAREJESTRUJ WYKONANE ĆWICZENIE</span><h3>Seria {activeSetIndex + 1} <span>z {current.sets_detail.length}</span></h3></div><div className="sf-wm-register-clock"><Clock3 size={18}/><strong>{elapsedLabel}</strong><small>czas treningu</small></div></div>
                <p>Wpisz faktyczny wynik serii, a następnie zapisz wykonanie.</p>
                <div className="sf-wm-register-inputs">
                  <label>Powtórzenia<input type="number" min="1" max="200" value={activeSet.reps} onChange={(event) => patchSet(activeExercise, activeSetIndex, { reps: clampNumber(Number(event.target.value), 1, 200) })}/></label>
                  <label>Ciężar (kg)<input type="number" min="0" max="1000" step="0.5" placeholder="Bez ciężaru" value={activeSet.weight_kg ?? ""} onChange={(event) => patchSet(activeExercise, activeSetIndex, { weight_kg: event.target.value === "" ? null : clampNumber(Number(event.target.value), 0, 1000) })}/></label>
                </div>
                <button className="sf-wm-button sf-wm-button-primary sf-wm-register-save" onClick={completeCurrentSet}><Check size={18}/> Zapisz serię i rozpocznij przerwę</button>
                <div className="sf-wm-register-footer"><span>Po zapisaniu: {current.rest_seconds ?? 90} s przerwy</span><span>{doneSets}/{allSets} serii wykonanych</span></div>
              </>
            ) : (
              <div className="sf-wm-all-done"><Check size={22}/><h3>Ćwiczenie ukończone</h3><p>Wszystkie serie tego ćwiczenia są zapisane.</p><button className="sf-wm-button sf-wm-button-secondary" onClick={() => { const next = exercises.findIndex((exercise, index) => index > activeExercise && exercise.sets_detail.some((set) => !set.completed)); if (next >= 0) setActiveExercise(next); }}>Następne ćwiczenie <ChevronRight size={16}/></button></div>
            )}
            <div className="sf-wm-exercise-controls"><button className="sf-wm-button sf-wm-button-secondary" disabled={activeExercise === 0} onClick={() => { setRestEnd(null); setPendingNextExercise(null); setActiveExercise((value) => Math.max(0, value - 1)); }}><ChevronLeft size={16}/> Poprzednie</button><button className="sf-wm-button sf-wm-button-secondary" disabled={activeExercise >= exercises.length - 1} onClick={() => { setRestEnd(null); setPendingNextExercise(null); setActiveExercise((value) => Math.min(exercises.length - 1, value + 1)); }}>Następne ćwiczenie <ChevronRight size={16}/></button></div>
          </article>
          <label className="sf-wm-notes">Notatki do treningu<textarea rows={3} maxLength={1000} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Samopoczucie, technika, uwagi…"/></label>
          <div className="sf-wm-finish-row"><span>Postęp: <strong>{progress}%</strong></span><button className="sf-wm-button sf-wm-button-primary" disabled={saving || !exercises.some((exercise) => exercise.name.trim())} onClick={onFinish}>{saving ? "Zapisywanie…" : "Zakończ i zapisz trening"} <Check size={16}/></button></div>
        </div>
      </div>
    </section>
  );
}
