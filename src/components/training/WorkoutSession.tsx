import { Check, CheckCircle2, ChevronRight, Dumbbell, Timer, X } from "lucide-react";
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

type HistorySet = { exerciseName: string; exerciseIndex: number; setIndex: number; reps: number; weight_kg: number | null };

export default function WorkoutSession({ title, elapsedLabel = "00:00", exercises, notes, saving = false, onExercisesChange, onNotesChange, onFinish, onCancel }: Props) {
  const [activeExercise, setActiveExercise] = useState(() => Math.max(0, exercises.findIndex((exercise) => exercise.sets_detail.some((set) => !set.completed))));
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
  const completedHistory = useMemo<HistorySet[]>(() => exercises.flatMap((exercise, exerciseIndex) => exercise.sets_detail.map((set, setIndex) => ({
    exerciseName: exercise.name, exerciseIndex, setIndex, reps: set.reps, weight_kg: set.weight_kg, completed: Boolean(set.completed),
  })).filter((set) => set.completed).map(({ completed: _completed, ...set }) => set)).reverse(), [exercises]);

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
  function extendRest(extraSeconds: number) {
    setRestEnd(Date.now() + (restSeconds + extraSeconds) * 1000);
  }
  function skipRest() {
    setRestEnd(null);
    if (pendingNextExercise !== null) setActiveExercise(pendingNextExercise);
    setPendingNextExercise(null);
  }

  return (
    <section className="sf-workout-mode sf-wm-active-session">
      <header className="sf-wm-session-header">
        <div className="sf-wm-session-title">
          <p className="sf-wm-eyebrow"><span className="sf-wm-status-pulse" /> TRENING W TOKU</p>
          <p>{doneExercises} z {exercises.length} ćwiczeń · {doneSets} z {allSets} serii</p>
        </div>
        <div className="sf-wm-header-tools">
          <button className="sf-wm-button sf-wm-button-quiet" onClick={onCancel}><X size={16} /> Zakończ później</button>
        </div>
      </header>
      <div className="sf-wm-progress"><div style={{ width: `${progress}%` }} /></div>
      <div className="sf-wm-session-layout">
        <aside className="sf-wm-exercise-nav"><span className="sf-wm-label">ĆWICZENIA</span>
          {exercises.map((exercise, index) => {
            const completed = exercise.sets_detail.length > 0 && exercise.sets_detail.every((set) => set.completed);
            return <button key={`${exercise.name}-${index}`} disabled={index !== activeExercise || restEnd !== null} className={`sf-wm-exercise-nav-item ${index === activeExercise ? "is-active" : ""} ${completed ? "is-complete" : ""}`} aria-current={index === activeExercise ? "step" : undefined}>
              <span className="sf-wm-exercise-index">{completed ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
              <span className="sf-wm-exercise-nav-name">{exercise.name}</span><small>{exercise.sets_detail.filter((set) => set.completed).length}/{exercise.sets_detail.length}</small>
            </button>;
          })}
        </aside>
        <div className="sf-wm-session-main">
          {restEnd !== null ? (
            <article className="sf-wm-current-exercise sf-wm-rest-focus sf-wm-animated-card" key={`rest-${activeExercise}-${doneSets}`}>
              <div className="sf-wm-rest-icon"><Timer size={22}/></div>
              <p className="sf-wm-eyebrow">CZAS NA REGENERACJĘ</p>
              <h2>{restLabel}</h2>
              <strong className="sf-wm-rest-countdown">{clock(restSeconds)}</strong>
              <p className="sf-wm-rest-description">Oddech wraca do normy. Po przerwie przejdziesz automatycznie do {restLabel === "Przerwa między ćwiczeniami" ? "kolejnego ćwiczenia" : "następnej serii"}.</p>
              <div className="sf-wm-rest-actions sf-wm-rest-extension-actions">
                <button type="button" onClick={() => extendRest(30)}>+30 s</button>
                <button type="button" onClick={() => extendRest(60)}>+60 s</button>
                <button type="button" onClick={() => extendRest(90)}>+90 s</button>
                <button type="button" className="sf-wm-rest-skip" onClick={skipRest}>Pomiń przerwę <ChevronRight size={15}/></button>
              </div>
              <div className="sf-wm-rest-meter"><span style={{ width: `${Math.min(100, restSeconds / Math.max(1, (pendingNextExercise === null ? (current.rest_seconds ?? 90) : (current.transition_rest_seconds ?? 120))) * 100)}%` }} /></div>
            </article>
          ) : activeSet ? (
            <article className="sf-wm-current-exercise sf-wm-register-card sf-wm-animated-card" key={`set-${activeExercise}-${activeSetIndex}`}>
              <div className="sf-wm-register-topline">
                <div className="sf-wm-register-exercise-name"><span className="sf-wm-label">AKTUALNE ĆWICZENIE</span><h2>{current.name}</h2><small>Seria {activeSetIndex + 1} z {current.sets_detail.length}</small></div>
                <div className="sf-wm-session-clock sf-wm-register-clock" role="timer" aria-live="off"><span>CZAS TRENINGU</span><strong>{elapsedLabel}</strong></div>
              </div>
              <div className="sf-wm-register-heading"><div><span className="sf-wm-label">ZAPISZ WYKONANĄ SERIĘ</span><h3>Wpisz wynik</h3></div><div className="sf-wm-register-target"><Dumbbell size={15}/><span>Plan: {current.sets_detail[activeSetIndex].reps} powt.</span></div></div>
              <div className="sf-wm-register-inputs">
                <label>Powtórzenia<input inputMode="numeric" type="number" min="1" max="200" value={activeSet.reps} onChange={(event) => patchSet(activeExercise, activeSetIndex, { reps: event.target.value === "" ? 1 : clampNumber(Number(event.target.value), 1, 200) })}/></label>
                <label>Ciężar (kg)<input inputMode="decimal" type="number" min="0" max="1000" step="0.5" placeholder="Np. 20 kg" value={activeSet.weight_kg ?? ""} onChange={(event) => patchSet(activeExercise, activeSetIndex, { weight_kg: event.target.value === "" ? null : clampNumber(Number(event.target.value), 0, 1000) })}/></label>
              </div>
              <button className="sf-wm-button sf-wm-button-primary sf-wm-register-save" onClick={completeCurrentSet}><CheckCircle2 size={18}/> Zapisz serię</button>
              <div className="sf-wm-register-footer"><span>Po tej serii: {activeSetIndex + 1 < current.sets_detail.length ? `${current.rest_seconds ?? 90} s przerwy` : `do ${current.transition_rest_seconds ?? 120} s przed kolejnym ćwiczeniem`}</span><span>{doneSets}/{allSets} serii zapisanych</span></div>
            </article>
          ) : (
            <article className="sf-wm-current-exercise sf-wm-all-done sf-wm-animated-card">
              <CheckCircle2 size={30}/><h2>Ćwiczenie ukończone</h2><p>Wszystkie serie są zapisane. Po ostatnim ćwiczeniu możesz zakończyć trening i zobaczyć podsumowanie.</p>
            </article>
          )}

          {completedHistory.length > 0 && <section className="sf-wm-set-history" aria-label="Zapisane serie">
            <div className="sf-wm-history-heading"><span className="sf-wm-label">ZAPISANE SERIE</span><span>{completedHistory.length} / {allSets}</span></div>
            {completedHistory.map((set) => <article className="sf-wm-history-card" key={`${set.exerciseIndex}-${set.setIndex}`} aria-disabled="true">
              <span className="sf-wm-history-check"><Check size={15}/></span>
              <div className="sf-wm-history-copy"><b>{set.exerciseName}</b><small>Seria {set.setIndex + 1} · {set.reps} powtórzeń{set.weight_kg != null ? ` · ${set.weight_kg} kg` : " · bez dodatkowego ciężaru"}</small></div>
              <span className="sf-wm-history-complete">Zapisano</span>
            </article>)}
          </section>}
          <label className="sf-wm-notes">Notatki do treningu<textarea rows={3} maxLength={1000} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Samopoczucie, technika, uwagi…"/></label>
          <div className="sf-wm-finish-row"><span>Postęp: <strong>{progress}%</strong></span><button className="sf-wm-button sf-wm-button-primary" disabled={saving || !exercises.some((exercise) => exercise.name.trim())} onClick={onFinish}>{saving ? "Zapisywanie…" : "Zakończ i zapisz trening"} <Check size={16}/></button></div>
        </div>
      </div>
    </section>
  );
}
