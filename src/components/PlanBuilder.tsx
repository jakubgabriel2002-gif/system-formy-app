import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { exerciseForProgramWeek, formatProgramDate, getProgramEndDate, isProgramComplete, PROGRESSION_OPTIONS, progressionOption, type ProgressionStrategy } from '../lib/trainingProgram';
import { exerciseCatalogGroups } from '../lib/exerciseCatalog';
import {
  ArrowDown, ArrowUp, CheckCircle2, ChevronRight, CircleHelp, Clock3,
  GripVertical, Plus, RotateCcw, Trash2, WandSparkles, X,
} from 'lucide-react';

type PlanExercise = {
  name: string;
  sets: number;
  reps: number;
  weight_kg?: number | null;
  notes?: string;
  rest_seconds?: number;
  transition_rest_seconds?: number;
  alternatives?: string[];
};
type PlanDay = { day_key: string; title: string; exercises: PlanExercise[] };
type Props = {
  days: PlanDay[];
  location: 'home' | 'gym';
  setDays: Dispatch<SetStateAction<PlanDay[]>>;
  loading?: boolean;
  progressionStrategy: ProgressionStrategy;
  setProgressionStrategy: Dispatch<SetStateAction<ProgressionStrategy>>;
  startDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
};

const DEFAULT_SET_REST = 90;
const DEFAULT_EXERCISE_REST = 120;
const MAX_DAYS = 7;
const MAX_EXERCISES = 40;

function secondsLabel(value: number) {
  if (value === 0) return 'Bez przerwy';
  if (value < 60) return `${value} s`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}
function dayKeyFor(days: PlanDay[]) {
  const available = 'ABCDEFGHIJKLMN'.split('').find(key => !days.some(day => day.day_key === key));
  return available || `D${days.length + 1}`;
}
function estimateDuration(day: PlanDay) {
  const work = day.exercises.reduce((total, ex) => total + Math.max(1, Number(ex.sets) || 1) * 35, 0);
  const intra = day.exercises.reduce((total, ex) => total + Math.max(0, (Number(ex.sets) || 1) - 1) * Math.max(0, Number(ex.rest_seconds ?? DEFAULT_SET_REST) || 0), 0);
  const between = day.exercises.slice(0, -1).reduce((total, ex) => total + Math.max(0, Number(ex.transition_rest_seconds ?? DEFAULT_EXERCISE_REST) || 0), 0);
  return Math.max(1, Math.round((work + intra + between) / 60));
}

export default function PlanBuilder({ days, setDays, location, loading = false, progressionStrategy, setProgressionStrategy, startDate, setStartDate }: Props) {
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const [catalogChoice, setCatalogChoice] = useState<Record<string, string>>({});
  const catalogGroups = useMemo(() => exerciseCatalogGroups(location), [location]);
  const incompleteDays = days.map((day, index) => ({ day, index })).filter(({ day }) => !day.title.trim() || !day.exercises.length || day.exercises.some(ex => !ex.name.trim()));

  useEffect(() => {
    if (activeDayIndex >= days.length) setActiveDayIndex(Math.max(0, days.length - 1));
  }, [activeDayIndex, days.length]);

  const activeDay = days[activeDayIndex];
  const totalExercises = useMemo(() => days.reduce((n, day) => n + day.exercises.length, 0), [days]);
  const totalSets = useMemo(() => days.reduce((n, day) => n + day.exercises.reduce((m, exercise) => m + (Number(exercise.sets) || 0), 0), 0), [days]);
  function updateDay(index: number, patch: Partial<PlanDay>) {
    setDays(old => old.map((day, i) => i === index ? { ...day, ...patch } : day));
  }
  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<PlanExercise>) {
    setDays(old => old.map((day, di) => di !== dayIndex ? day : {
      ...day,
      exercises: day.exercises.map((exercise, ei) => ei === exerciseIndex ? { ...exercise, ...patch } : exercise),
    }));
  }
  function addExercise() {
    if (!activeDay || activeDay.exercises.length >= MAX_EXERCISES) return;
    setDays(old => old.map((day, i) => i === activeDayIndex ? {
      ...day,
      exercises: [...day.exercises, { name: '', sets: 3, reps: 10, weight_kg: null, rest_seconds: DEFAULT_SET_REST, transition_rest_seconds: DEFAULT_EXERCISE_REST }],
    } : day));
    setShowPreview(false);
  }
  function removeExercise(index: number) {
    if (!activeDay) return;
    setDays(old => old.map((day, i) => i === activeDayIndex ? { ...day, exercises: day.exercises.filter((_, ei) => ei !== index) } : day));
  }
  function moveExercise(index: number, delta: number) {
    if (!activeDay) return;
    const target = index + delta;
    if (target < 0 || target >= activeDay.exercises.length) return;
    setDays(old => old.map((day, i) => {
      if (i !== activeDayIndex) return day;
      const exercises = [...day.exercises];
      [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
      return { ...day, exercises };
    }));
  }
  function addDay() {
    if (days.length >= MAX_DAYS) return;
    const next = { day_key: dayKeyFor(days), title: `Dzień ${days.length + 1}`, exercises: [] as PlanExercise[] };
    setDays(old => [...old, next]);
    setActiveDayIndex(days.length);
    setShowPreview(false);
  }
  function removeDay() {
    if (days.length <= 1 || !activeDay) return;
    if (!window.confirm(`Usunąć „${activeDay.title}” wraz ze wszystkimi ćwiczeniami?`)) return;
    setDays(old => old.filter((_, index) => index !== activeDayIndex));
    setActiveDayIndex(Math.max(0, activeDayIndex - 1));
    setShowPreview(false);
  }

  return (
    <section className="sf-plan-builder" aria-label="Interaktywny kreator planu treningowego">
      <div className="sf-builder-progress">
        <div className="sf-builder-progress-track"><span style={{ width: showPreview ? '100%' : '66%' }} /></div>
        <div className="sf-builder-progress-labels"><span className={!showPreview ? 'is-current' : 'is-done'}><b>1</b> Budowanie planu</span><span className={showPreview ? 'is-current' : ''}><b>{showPreview ? '✓' : '2'}</b> Podgląd i kontrola</span></div>
      </div>

      <div className="sf-builder-summary-grid">
        <div><span>Treningi w tygodniu</span><strong>{days.length}<small> / {MAX_DAYS}</small></strong></div>
        <div><span>Ćwiczenia tygodniowo</span><strong>{totalExercises}</strong></div>
        <div><span>Serie bazowe</span><strong>{totalSets}</strong></div>
      </div>
      {incompleteDays.length > 0 && <div className="sf-builder-validation-note" role="status"><b>Plan wymaga uzupełnienia przed zapisem.</b><span>{incompleteDays.map(({day,index}) => `Dzień ${index + 1}${!day.title.trim() ? ' — wpisz nazwę' : ''}${!day.exercises.length ? ' — dodaj ćwiczenie' : day.exercises.some(ex => !ex.name.trim()) ? ' — uzupełnij nazwy ćwiczeń' : ''}`).join(' · ')}</span></div>}

      <section className="sf-month-program-card" aria-label="Ustawienia miesięcznego programu">
        <div className="sf-month-program-heading">
          <span className="sf-month-program-icon"><Clock3 size={19}/></span>
          <div><p className="sf-eyebrow">PROGRAM NA 4 TYGODNIE</p><h3>Ustaw start i sposób progresji</h3><p>Układ tygodniowy powtarza się przez 4 tygodnie. Program trwa od {formatProgramDate(startDate)} do {formatProgramDate(getProgramEndDate(startDate))}. Progresja dostosowuje parametry kolejnych tygodni — nie trzeba ręcznie tworzyć 28 osobnych dni.</p></div>
        </div>
        <div className="sf-month-program-fields">
          <label>Data rozpoczęcia programu<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required /></label>
          <label>Specyfika progresu<select value={progressionStrategy} onChange={event => setProgressionStrategy(event.target.value as ProgressionStrategy)}>{PROGRESSION_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
        {isProgramComplete(startDate) && <div className="sf-month-program-complete"><b>Ten blok 4-tygodniowy dobiegł końca.</b><span>Ustaw nową datę rozpoczęcia, aby rozpocząć kolejny miesiąc programu.</span></div>}
        <div className="sf-month-progression-explainer"><b>{progressionOption(progressionStrategy).shortLabel}</b><span>{progressionOption(progressionStrategy).explanation}</span></div>
        <div className="sf-month-week-preview">
          {[1, 2, 3, 4].map(week => {
            const example = days.flatMap(day => day.exercises).find(exercise => exercise.name.trim());
            const prescribed = example ? exerciseForProgramWeek(example, progressionStrategy, week) : null;
            const value = !prescribed ? 'Dodaj ćwiczenia' : progressionStrategy === 'weight'
              ? prescribed.weight_kg != null ? `${prescribed.weight_kg} kg` : 'Mały wzrost ciężaru, jeśli technika jest dobra'
              : progressionStrategy === 'none' ? `${prescribed.sets} ser. × ${prescribed.reps} powt.`
              : progressionStrategy === 'sets' ? `${prescribed.sets} ser. × ${prescribed.reps} powt.`
              : `${prescribed.sets} ser. × ${prescribed.reps} powt.`;
            return <div className="sf-month-week-chip" key={week}><span>TYDZIEŃ {week}</span><b>{value}</b><small>{week === 1 ? 'Punkt wyjścia' : progressionStrategy === 'none' ? 'Stałe parametry' : 'Progresja względem bazy'}</small></div>;
          })}
        </div>
      </section>

      {!showPreview ? <>
        <div className="sf-builder-section-heading">
          <div><p className="sf-eyebrow">KROK 1</p><h4>Ułóż tygodniowy schemat treningów</h4><p>Dodaj od 1 do 7 różnych jednostek. Ten schemat będzie powtarzany przez 4 tygodnie, a wybrana progresja ustawi parametry kolejnych tygodni.</p></div>
          <span className="sf-builder-heading-mark"><WandSparkles size={20}/></span>
        </div>

        <div className="sf-builder-day-tabs" role="tablist" aria-label="Dni planu">
          {days.map((day, index) => <button key={`${day.day_key}-${index}`} type="button" role="tab" aria-selected={activeDayIndex === index} className={activeDayIndex === index ? 'is-active' : ''} onClick={() => setActiveDayIndex(index)}>
            <span>DZIEŃ {index + 1}</span><strong>{day.title.replace(/^Dzień\s+\d+\s*[-—:]?\s*/i, '').trim() || `Trening ${index + 1}`}</strong><small>{day.exercises.length} ćw.</small>
          </button>)}
          <button type="button" className="sf-builder-add-day-tab" onClick={addDay} disabled={days.length >= MAX_DAYS} aria-label="Dodaj dzień treningowy"><Plus size={18}/><span>Dodaj dzień</span></button>
        </div>

        {activeDay && <div className="sf-builder-active-day" key={`${activeDay.day_key}-${activeDayIndex}`}>
          <div className="sf-builder-day-title-row">
            <label className="sf-builder-day-title-label">Nazwa tego dnia
              <input value={activeDay.title} maxLength={120} onChange={e => updateDay(activeDayIndex, { title: e.target.value })} placeholder={`Dzień ${activeDayIndex + 1} — np. Góra ciała`} required />
            </label>
            <div className="sf-builder-day-title-actions">
              <button type="button" className="sf-icon-button sf-danger" title="Usuń dzień" aria-label="Usuń dzień" disabled={days.length <= 1} onClick={removeDay}><Trash2 size={16}/></button>
            </div>
          </div>

          {activeDay.exercises.length === 0 && <div className="sf-builder-empty-day"><span><DumbbellPlaceholder /></span><h4>Ten dzień jest jeszcze pusty</h4><p>Ten dzień musi mieć co najmniej jedno ćwiczenie, inaczej nie będzie można zapisać całego planu. Wybierz je z katalogu albo wpisz własną nazwę.</p><button type="button" className="sf-button sf-button-lime" onClick={addExercise}><Plus size={16}/> Dodaj pierwsze ćwiczenie</button></div>}

          <div className="sf-builder-exercises">
            {activeDay.exercises.map((exercise, index) => {
              const key = `${activeDay.day_key}-${index}`;
              const isAdvanced = Boolean(advanced[key]);
              return <article className="sf-builder-exercise-card" key={key}>
                <div className="sf-builder-exercise-top">
                  <span className="sf-builder-exercise-number">{String(index + 1).padStart(2, '0')}</span>
                  <label className="sf-builder-exercise-name">Nazwa ćwiczenia
                    <input required maxLength={120} value={exercise.name} onChange={e => updateExercise(activeDayIndex, index, { name: e.target.value })} placeholder="np. Przysiady ze sztangą" />
                  </label>
                  <div className="sf-builder-exercise-actions">
                    <button type="button" className="sf-icon-button" title="Przesuń wyżej" aria-label="Przesuń ćwiczenie wyżej" disabled={index === 0} onClick={() => moveExercise(index, -1)}><ArrowUp size={15}/></button>
                    <button type="button" className="sf-icon-button" title="Przesuń niżej" aria-label="Przesuń ćwiczenie niżej" disabled={index === activeDay.exercises.length - 1} onClick={() => moveExercise(index, 1)}><ArrowDown size={15}/></button>
                    <button type="button" className="sf-icon-button sf-danger" title="Usuń ćwiczenie" aria-label="Usuń ćwiczenie" onClick={() => removeExercise(index)}><X size={15}/></button>
                  </div>
                </div>
                <label className="sf-builder-exercise-catalog">Dodaj / wybierz z katalogu ćwiczeń
                  <select value={catalogChoice[key] || ''} disabled={loading} onChange={event => { const value = event.target.value; setCatalogChoice(old => ({ ...old, [key]: value })); if (value) updateExercise(activeDayIndex, index, { name: value }); }}>
                    <option value="">Wybierz ćwiczenie…</option>
                    {catalogGroups.map(group => <optgroup label={group.category} key={group.category}>{group.exercises.map(name => <option key={`${group.category}-${name}`} value={name}>{name}</option>)}</optgroup>)}
                  </select>
                  <small>Lista jest podzielona na partie mięśniowe. Możesz też wpisać własną nazwę powyżej.</small>
                </label>
                {!exercise.name.trim() && <small className="sf-builder-field-error">Wpisz nazwę ćwiczenia albo wybierz pozycję z katalogu.</small>}

                <div className="sf-builder-prescription-grid">
                  <label><span>Serie</span><input type="number" min="1" max="30" step="1" required value={exercise.sets} onChange={e => updateExercise(activeDayIndex, index, { sets: e.target.value === '' ? 1 : Number(e.target.value) })}/></label>
                  <label><span>Powtórzenia</span><input type="number" min="1" max="200" step="1" required value={exercise.reps} onChange={e => updateExercise(activeDayIndex, index, { reps: e.target.value === '' ? 1 : Number(e.target.value) })}/></label>
                  <label><span>Ciężar <em>opcjonalnie</em></span><div className="sf-builder-weight-input"><input type="number" min="0" max="1000" step="0.5" placeholder="—" value={exercise.weight_kg ?? ''} onChange={e => updateExercise(activeDayIndex, index, { weight_kg: e.target.value === '' ? null : Number(e.target.value) })}/><b>kg</b></div></label>
                </div>

                <button type="button" className={`sf-builder-advanced-toggle ${isAdvanced ? 'is-open' : ''}`} aria-expanded={isAdvanced} onClick={() => setAdvanced(old => ({ ...old, [key]: !old[key] }))}>
                  <span><SlidersPlaceholder /> Ustawienia przerw i wskazówki</span><span className="sf-builder-toggle-chevron">{isAdvanced ? '−' : '+'}</span>
                </button>
                {isAdvanced && <div className="sf-builder-advanced-panel">
                  <div className="sf-builder-rest-grid">
                    <label><span>Przerwa między seriami <span className="sf-help-dot" tabIndex={0} role="img" aria-label="Przerwa między seriami" title="Odpoczynek po zapisaniu serii, zanim wykonasz następną serię tego samego ćwiczenia."><CircleHelp size={14}/></span></span><div className="sf-builder-seconds-input"><input type="number" min="0" max="600" step="15" value={exercise.rest_seconds ?? DEFAULT_SET_REST} onChange={e => updateExercise(activeDayIndex, index, { rest_seconds: e.target.value === '' ? 0 : Number(e.target.value) })}/><b>s</b></div><small>{secondsLabel(Number(exercise.rest_seconds ?? DEFAULT_SET_REST))}</small></label>
                    <label><span>Przerwa między ćwiczeniami <span className="sf-help-dot" tabIndex={0} role="img" aria-label="Przerwa między ćwiczeniami" title="Odpoczynek po ostatniej serii danego ćwiczenia, zanim zaczniesz następne ćwiczenie w planie."><CircleHelp size={14}/></span></span><div className="sf-builder-seconds-input"><input type="number" min="0" max="900" step="15" value={exercise.transition_rest_seconds ?? DEFAULT_EXERCISE_REST} onChange={e => updateExercise(activeDayIndex, index, { transition_rest_seconds: e.target.value === '' ? 0 : Number(e.target.value) })}/><b>s</b></div><small>{secondsLabel(Number(exercise.transition_rest_seconds ?? DEFAULT_EXERCISE_REST))}</small></label>
                  </div>
                  <label className="sf-builder-notes">Wskazówka do ćwiczenia <em>opcjonalnie</em><textarea rows={2} maxLength={500} value={exercise.notes || ''} onChange={e => updateExercise(activeDayIndex, index, { notes: e.target.value })} placeholder="Np. wykonuj ruch spokojnie i kontroluj technikę."/></label>
                </div>}
                <div className="sf-builder-exercise-footer"><span><GripVertical size={14}/> Ćwiczenie {index + 1} z {activeDay.exercises.length}</span><span>{exercise.sets || 0} serie × {exercise.reps || 0} powt.</span></div>
              </article>;
            })}
          </div>
          {activeDay.exercises.length > 0 && <button type="button" className="sf-builder-add-exercise" onClick={addExercise} disabled={activeDay.exercises.length >= MAX_EXERCISES}><span><Plus size={18}/></span><b>Dodaj ćwiczenie</b><small>{activeDay.exercises.length}/{MAX_EXERCISES}</small></button>}
          <div className="sf-builder-day-footer"><span><Clock3 size={15}/> Szacowany czas: ok. {estimateDuration(activeDay)} min</span><span>{activeDay.exercises.length} ćwiczeń · {activeDay.exercises.reduce((n, ex) => n + (Number(ex.sets) || 0), 0)} serii</span></div>
        </div>}

        <div className="sf-builder-bottom-actions">
          <button type="button" className="sf-button sf-button-outline" onClick={() => setShowPreview(true)}><CheckCircle2 size={16}/> Sprawdź cały plan <ChevronRight size={15}/></button>
          <p>Podgląd pokaże wszystkie dni i ćwiczenia przed zapisaniem zmian.</p>
        </div>
      </> : <div className="sf-builder-review">
        <div className="sf-builder-section-heading"><div><p className="sf-eyebrow">KROK 2</p><h4>Sprawdź plan przed zapisem</h4><p>Przejrzyj strukturę i wróć do dowolnego dnia, jeśli chcesz coś poprawić.</p></div><span className="sf-builder-heading-mark"><CheckCircle2 size={20}/></span></div>
        <div className="sf-builder-review-summary"><div><small>Tygodnie</small><strong>4</strong></div><div><small>Treningi / tydzień</small><strong>{days.length}</strong></div><div><small>Ćwiczenia / tydzień</small><strong>{totalExercises}</strong></div><div><small>Start programu</small><strong>{startDate || "—"}</strong></div></div>
        <div className="sf-builder-review-days">{days.map((day, index) => <article className="sf-builder-review-day" key={`${day.day_key}-${index}`}>
          <div className="sf-builder-review-day-heading"><div><span>DZIEŃ {index + 1}</span><h5>{day.title || `Dzień ${index + 1}`}</h5></div><button type="button" className="sf-button sf-button-outline sf-button-sm" onClick={() => { setActiveDayIndex(index); setShowPreview(false); }}>Edytuj <ChevronRight size={14}/></button></div>
          {day.exercises.length ? <div className="sf-builder-review-exercises">{day.exercises.map((exercise, exerciseIndex) => <div key={`${exercise.name}-${exerciseIndex}`}><span className="sf-builder-review-index">{String(exerciseIndex + 1).padStart(2, '0')}</span><div><b>{exercise.name || 'Ćwiczenie bez nazwy'}</b><small>{exercise.sets} serie × {exercise.reps} powt. {exercise.weight_kg != null ? `· ${exercise.weight_kg} kg` : '· bez określonego ciężaru'}</small><small>Przerwa: {secondsLabel(Number(exercise.rest_seconds ?? DEFAULT_SET_REST))} · po ćwiczeniu: {secondsLabel(Number(exercise.transition_rest_seconds ?? DEFAULT_EXERCISE_REST))}</small></div></div>)}</div> : <div className="sf-builder-review-empty">Dodaj ćwiczenia do tego dnia przed zapisaniem planu.</div>}
        </article>)}</div>
        <button type="button" className="sf-button sf-button-outline" onClick={() => setShowPreview(false)}><RotateCcw size={15}/> Wróć do edycji</button>
      </div>}
    </section>
  );
}

function DumbbellPlaceholder() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9v6M7 6v12M7 12h10M17 6v12M21 9v6"/></svg>;
}
function SlidersPlaceholder() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>;
}
