import { Check, ChevronLeft, ChevronRight, Clock3, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkoutExercise } from "./workoutTypes";

type Props = {
  title: string;
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

export default function WorkoutSession({
  title,
  exercises,
  notes,
  saving = false,
  onExercisesChange,
  onNotesChange,
  onFinish,
  onCancel,
}: Props) {
  const [activeExercise, setActiveExercise] = useState(0);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const current = exercises[activeExercise];
  const allSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets_detail.length, 0), [exercises]);
  const doneSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets_detail.filter((set) => set.completed).length, 0), [exercises]);
  const doneExercises = useMemo(() => exercises.filter((exercise) => exercise.sets_detail.length > 0 && exercise.sets_detail.every((set) => set.completed)).length, [exercises]);
  const progress = allSets ? Math.round((doneSets / allSets) * 100) : 0;

  useEffect(() => {
    if (restEnd === null) {
      setRestSeconds(0);
      return;
    }
    const update = () => {
      const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
      setRestSeconds(left);
      if (left === 0) setRestEnd(null);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [restEnd]);

  if (!current) {
    return (
      <section className="sf-workout-mode">
        <div className="sf-wm-empty">
          <h2>Brak ćwiczeń w tej sesji</h2>
          <p>Wróć do planu i dodaj co najmniej jedno ćwiczenie.</p>
          <button className="sf-wm-button sf-wm-button-secondary" onClick={onCancel}>Wróć</button>
        </div>
      </section>
    );
  }

  function patchSet(exerciseIndex: number, setIndex: number, patch: Partial<WorkoutExercise["sets_detail"][number]>) {
    onExercisesChange(exercises.map((exercise, i) => i !== exerciseIndex ? exercise : {
      ...exercise,
      sets_detail: exercise.sets_detail.map((set, j) => j === setIndex ? { ...set, ...patch } : set),
    }));
  }

  function addSet() {
    const previous = current.sets_detail[current.sets_detail.length - 1];
    onExercisesChange(exercises.map((exercise, i) => i !== activeExercise ? exercise : {
      ...exercise,
      sets_detail: [...exercise.sets_detail, { reps: previous?.reps ?? 10, weight_kg: previous?.weight_kg ?? null, completed: false }],
    }));
  }

  function removeSet(setIndex: number) {
    if (current.sets_detail.length <= 1) return;
    onExercisesChange(exercises.map((exercise, i) => i !== activeExercise ? exercise : {
      ...exercise,
      sets_detail: exercise.sets_detail.filter((_, j) => j !== setIndex),
    }));
  }

  function startRest(seconds: number) {
    setRestEnd(Date.now() + seconds * 1000);
  }

  return (
    <section className="sf-workout-mode">
      <header className="sf-wm-session-header">
        <div>
          <p className="sf-wm-eyebrow">TRENING W TOKU</p>
          <h1>{title || "Twój trening"}</h1>
          <p>{doneExercises} z {exercises.length} ćwiczeń ukończonych · {doneSets} z {allSets} serii</p>
        </div>
        <button className="sf-wm-button sf-wm-button-quiet" onClick={onCancel}><X size={16} /> Zakończ później</button>
      </header>

      <div className="sf-wm-progress" aria-label={`Ukończono ${progress}% treningu`}>
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="sf-wm-session-layout">
        <aside className="sf-wm-exercise-nav">
          <span className="sf-wm-label">ĆWICZENIA</span>
          {exercises.map((exercise, index) => {
            const completed = exercise.sets_detail.length > 0 && exercise.sets_detail.every((set) => set.completed);
            return (
              <button
                key={`${exercise.name}-${index}`}
                className={`sf-wm-exercise-nav-item ${index === activeExercise ? "is-active" : ""}`}
                onClick={() => setActiveExercise(index)}
              >
                <span className="sf-wm-exercise-index">{completed ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
                <span className="sf-wm-exercise-nav-name">{exercise.name}</span>
                <small>{exercise.sets_detail.filter((set) => set.completed).length}/{exercise.sets_detail.length}</small>
              </button>
            );
          })}
        </aside>

        <div className="sf-wm-session-main">
          <article className="sf-wm-current-exercise">
            <div className="sf-wm-current-meta">
              <span>ĆWICZENIE {String(activeExercise + 1).padStart(2, "0")} / {String(exercises.length).padStart(2, "0")}</span>
              <span>{current.sets_detail.length} serii</span>
            </div>
            <h2>{current.name}</h2>
            <p>Wpisz faktyczny wynik i zaznacz serię po jej wykonaniu.</p>

            <div className="sf-wm-set-header">
              <span>Seria</span><span>Ciężar (kg)</span><span>Powtórzenia</span><span>Status</span>
            </div>
            <div className="sf-wm-sets">
              {current.sets_detail.map((set, index) => (
                <div className={`sf-wm-set-row ${set.completed ? "is-complete" : ""}`} key={index}>
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <input
                    type="number" min="0" max="1000" step="0.5"
                    aria-label={`Seria ${index + 1}, ciężar w kilogramach`}
                    value={set.weight_kg ?? ""}
                    onChange={(event) => patchSet(activeExercise, index, { weight_kg: event.target.value === "" ? null : clampNumber(Number(event.target.value), 0, 1000) })}
                  />
                  <input
                    type="number" min="1" max="200"
                    aria-label={`Seria ${index + 1}, powtórzenia`}
                    value={set.reps}
                    onChange={(event) => patchSet(activeExercise, index, { reps: clampNumber(Number(event.target.value), 1, 200) })}
                  />
                  <button
                    className={`sf-wm-set-check ${set.completed ? "is-checked" : ""}`}
                    aria-label={set.completed ? `Oznacz serię ${index + 1} jako niewykonaną` : `Oznacz serię ${index + 1} jako wykonaną`}
                    onClick={() => {
                      patchSet(activeExercise, index, { completed: !set.completed });
                      if (!set.completed) startRest(90);
                    }}
                  >
                    <Check size={17} />
                  </button>
                  <button className="sf-wm-remove-set" aria-label={`Usuń serię ${index + 1}`} disabled={current.sets_detail.length <= 1} onClick={() => removeSet(index)}>
                    <Minus size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button className="sf-wm-text-button" onClick={addSet}><Plus size={15} /> Dodaj serię</button>

            <div className="sf-wm-exercise-controls">
              <button className="sf-wm-button sf-wm-button-secondary" disabled={activeExercise === 0} onClick={() => setActiveExercise((value) => Math.max(0, value - 1))}>
                <ChevronLeft size={16} /> Poprzednie
              </button>
              <button className="sf-wm-button sf-wm-button-primary" disabled={activeExercise >= exercises.length - 1} onClick={() => setActiveExercise((value) => Math.min(exercises.length - 1, value + 1))}>
                Następne ćwiczenie <ChevronRight size={16} />
              </button>
            </div>
          </article>

          <article className="sf-wm-rest-card">
            <div>
              <span className="sf-wm-label"><Clock3 size={14} /> PRZERWA MIĘDZY SERIAMI</span>
              <strong>{restSeconds ? `${Math.floor(restSeconds / 60).toString().padStart(2, "0")}:${(restSeconds % 60).toString().padStart(2, "0")}` : "Gotowy na kolejną serię?"}</strong>
            </div>
            <div className="sf-wm-rest-actions">
              {[60, 90, 120].map((seconds) => (
                <button key={seconds} className={restSeconds > 0 && Math.ceil(restSeconds / 30) === seconds / 30 ? "is-active" : ""} onClick={() => startRest(seconds)}>{seconds} s</button>
              ))}
              {restEnd !== null && <button aria-label="Zatrzymaj przerwę" onClick={() => setRestEnd(null)}><X size={14} /></button>}
            </div>
          </article>

          <label className="sf-wm-notes">
            Notatki do treningu
            <textarea rows={3} maxLength={1000} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Samopoczucie, technika, uwagi…" />
          </label>
          <div className="sf-wm-finish-row">
            <span>Postęp: <strong>{progress}%</strong></span>
            <button className="sf-wm-button sf-wm-button-primary" disabled={saving || !exercises.some((exercise) => exercise.name.trim())} onClick={onFinish}>
              {saving ? "Zapisywanie…" : "Zakończ i zapisz trening"} <Check size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
