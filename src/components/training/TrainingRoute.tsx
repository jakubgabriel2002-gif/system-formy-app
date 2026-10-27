import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkoutLanding from './WorkoutLanding';
import WorkoutSession from './WorkoutSession';
import WorkoutSummary from './WorkoutSummary';
import type { WorkoutDraft, WorkoutExercise, WorkoutPlan, WorkoutPlanDay } from './workoutTypes';
import { exerciseForProgramWeek, getProgramWeek, PROGRAM_WEEKS } from '../../lib/trainingProgram';
import './workout.css';
import './workout-fix-extra.css';

type Props = {
  onGoToPlans: () => void;
  onBackToDashboard: () => void;
  onSaved: () => Promise<unknown> | unknown;
  isPremium?: boolean;
  onOpenStore?: () => void;
  onOpenPremium?: () => void;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  let data: unknown = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : `Wystąpił błąd (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function sampleProgramStartDate(planId: string) {
  const fallback = localDate();
  try {
    const key = `sf-sample-program-start:${planId}`;
    const stored = window.localStorage.getItem(key);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    window.localStorage.setItem(key, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function exercisesForDay(day: WorkoutPlanDay): WorkoutExercise[] {
  return day.exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({
    name: exercise.name.trim(),
    notes: exercise.notes,
    progression_note: 'progression_note' in exercise && typeof exercise.progression_note === 'string' ? exercise.progression_note : undefined,
    rest_seconds: Number(exercise.rest_seconds ?? 90),
    transition_rest_seconds: Number(exercise.transition_rest_seconds ?? 120),
    sets_detail: Array.from({ length: Math.max(1, Math.min(30, Number(exercise.sets) || 3)) }, () => ({
      reps: Math.max(1, Math.min(200, Number(exercise.reps) || 10)),
      weight_kg: exercise.weight_kg ?? null,
      completed: false,
    })),
  }));
}

const SAMPLE_PLANS: WorkoutPlan[] = [
  {
    id: 'sample:home',
    name: 'Przykładowy plan — trening w domu',
    description: 'Czterotygodniowy program z masą własnego ciała. Dobierz łatwiejszy wariant, jeśli jest potrzebny.',
    duration_weeks: PROGRAM_WEEKS, progression_strategy: 'reps',
    days: [
      { day_key: 'A', title: 'Dzień A — całe ciało', exercises: [
        { name: 'Pompki w dostosowanym wariancie', sets: 3, reps: 8, notes: 'Wybierz wariant, w którym zachowujesz pełną kontrolę ruchu.' },
        { name: 'Przysiady bez obciążenia', sets: 3, reps: 12 },
        { name: 'Most biodrowy', sets: 3, reps: 12 },
        { name: 'Plank', sets: 3, reps: 25, notes: 'Czas utrzymania pozycji w sekundach; nie zwiększaj go automatycznie przez dodawanie powtórzeń.' },
      ] },
      { day_key: 'B', title: 'Dzień B — nogi i brzuch', exercises: [
        { name: 'Wykroki w tył na stronę', sets: 3, reps: 8 },
        { name: 'Wspięcia na palce', sets: 3, reps: 15 },
        { name: 'Dead bug na stronę', sets: 3, reps: 8 },
        { name: 'Koci grzbiet', sets: 2, reps: 10, notes: 'Spokojna mobilizacja.' },
      ] },
      { day_key: 'C', title: 'Dzień C — całe ciało', exercises: [
        { name: 'Pompki przy ścianie lub blacie', sets: 3, reps: 10 },
        { name: 'Przysiady bez obciążenia', sets: 3, reps: 12 },
        { name: 'Wykroki w miejscu', sets: 3, reps: 8 },
        { name: 'Superman — unoszenie tułowia', sets: 2, reps: 10 },
      ] },
    ],
  },
  {
    id: 'sample:gym',
    name: 'Przykładowy plan — siłownia',
    description: 'Czterotygodniowy program siłowy. Ciężar dobieraj do techniki i zapisanych wyników.',
    duration_weeks: PROGRAM_WEEKS, progression_strategy: 'weight',
    days: [
      { day_key: 'A', title: 'Dzień A — całe ciało', exercises: [
        { name: 'Wyciskanie na ławce', sets: 3, reps: 8, weight_kg: null },
        { name: 'Ściąganie drążka wyciągu górnego', sets: 3, reps: 10, weight_kg: null },
        { name: 'Wypychanie nóg na suwnicy', sets: 3, reps: 10, weight_kg: null },
        { name: 'Plank', sets: 3, reps: 25, notes: 'Czas utrzymania pozycji w sekundach.' },
      ] },
      { day_key: 'B', title: 'Dzień B — nogi i plecy', exercises: [
        { name: 'Martwy ciąg rumuński z hantlami', sets: 3, reps: 10, weight_kg: null },
        { name: 'Wiosłowanie siedząc na wyciągu', sets: 3, reps: 10, weight_kg: null },
        { name: 'Uginanie nóg na maszynie', sets: 3, reps: 12, weight_kg: null },
        { name: 'Pallof press na wyciągu', sets: 2, reps: 10, weight_kg: null },
      ] },
      { day_key: 'C', title: 'Dzień C — góra ciała', exercises: [
        { name: 'Wyciskanie hantli nad głowę', sets: 3, reps: 10, weight_kg: null },
        { name: 'Wiosłowanie z podparciem klatki', sets: 3, reps: 10, weight_kg: null },
        { name: 'Hip thrust', sets: 3, reps: 10, weight_kg: null },
        { name: 'Face pull', sets: 2, reps: 12, weight_kg: null },
      ] },
    ],
  },
];

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TrainingRoute({ onGoToPlans, onBackToDashboard, onSaved, isPremium = false, onOpenStore, onOpenPremium }: Props) {
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [title, setTitle] = useState('');
  const [performedOn, setPerformedOn] = useState(localDate());
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [planResult, draftResult] = await Promise.all([
        request<{ plans?: WorkoutPlan[] }>('/api/v2/training/plans'),
        request<{ draft?: WorkoutDraft | null }>('/api/v2/training/draft'),
      ]);
      setPlans(Array.isArray(planResult.plans) ? planResult.plans : []);
      const loadedDraft = draftResult.draft?.started && draftResult.draft.plan_id ? draftResult.draft : null;
      setDraft(loadedDraft);
      setSessionActive(false);
      if (loadedDraft) {
        setTitle(loadedDraft.title || 'Trening');
        setPerformedOn(loadedDraft.performed_on || localDate());
        setNotes(loadedDraft.notes || '');
        setExercises(Array.isArray(loadedDraft.exercises) ? loadedDraft.exercises : []);
        const startTime = Number(loadedDraft.started_at);
        const validStart = Number.isFinite(startTime) && startTime > 0 ? startTime : Date.now();
        setStartedAt(validStart);
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - validStart) / 1000)));
      } else {
        setStartedAt(null);
        setElapsedSeconds(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać danych treningowych.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = Boolean(sessionActive && draft?.started && draft.plan_id && exercises.length && !summary);

  useEffect(() => {
    if (!active || startedAt === null) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  const draftToSave = useMemo<WorkoutDraft | null>(() => active ? ({
    title, performed_on: performedOn, notes, exercises,
    plan_id: draft?.plan_id, day_key: draft?.day_key, started: true,
    started_at: startedAt,
  }) : null, [active, title, performedOn, notes, exercises, draft?.plan_id, draft?.day_key, startedAt]);

  useEffect(() => {
    if (!draftToSave || loading) return;
    const timer = window.setTimeout(() => {
      void request('/api/v2/training/draft', { method: 'PUT', body: JSON.stringify({ draft: draftToSave }) }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftToSave, loading]);

  const start = (plan: WorkoutPlan, dayKey: string) => {
    const day = plan.days.find((item) => item.day_key === dayKey);
    if (!day) return;
    const week = getProgramWeek(plan.start_date || localDate(), new Date(), plan.duration_weeks || PROGRAM_WEEKS);
    const adjustedDay: WorkoutPlanDay = {
      ...day,
      exercises: day.exercises.map((exercise) => exerciseForProgramWeek(exercise, plan.progression_strategy || 'reps', week)),
    };
    const nextExercises = exercisesForDay(adjustedDay);
    if (!nextExercises.length) {
      setError('Ten dzień nie ma ćwiczeń. Dodaj je w kreatorze planów.');
      return;
    }
    const now = Date.now();
    const next: WorkoutDraft = {
      title: `${plan.name} — ${day.title} — Tydzień ${week}/${plan.duration_weeks || PROGRAM_WEEKS}`.slice(0, 120),
      performed_on: localDate(), notes: '', exercises: nextExercises,
      plan_id: plan.id, day_key: day.day_key, started: true, started_at: now,
    };
    setDraft(next);
    setSessionActive(true);
    setTitle(next.title);
    setPerformedOn(next.performed_on);
    setNotes('');
    setExercises(nextExercises);
    setStartedAt(now);
    setElapsedSeconds(0);
    setSummary(false);
    setError('');
    void request('/api/v2/training/draft', { method: 'PUT', body: JSON.stringify({ draft: next }) }).catch((e) => {
      setError(e instanceof Error ? `Trening rozpoczęty, ale nie udało się zapisać kopii roboczej: ${e.message}` : 'Trening rozpoczęty, ale kopia robocza nie została zapisana.');
    });
  };

  const resume = () => {
    if (!draft) return;
    setSessionActive(true);
    const now = Date.now();
    const savedStart = Number(draft.started_at);
    const startTime = Number.isFinite(savedStart) && savedStart > 0 ? savedStart : now;
    setSessionActive(true);
    setTitle(draft.title || 'Trening');
    setPerformedOn(draft.performed_on || localDate());
    setNotes(draft.notes || '');
    setExercises(draft.exercises || []);
    setStartedAt(startTime);
    setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
    setSummary(false);
  };

  const finish = async () => {
    if (!exercises.some((exercise) => exercise.name.trim())) {
      setError('Dodaj co najmniej jedno ćwiczenie.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await request('/api/v2/training/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: title || 'Trening', performed_on: performedOn, notes,
          exercises: exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({
            ...exercise, name: exercise.name.trim(),
          })),
        }),
      });
      await request('/api/v2/training/draft', { method: 'DELETE' }).catch(() => {});
      setDraft(null);
      setSummary(true);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać treningu.');
    } finally {
      setSaving(false);
    }
  };

  const pauseWorkout = async (): Promise<boolean> => {
    const pausedDraft: WorkoutDraft = {
      title: title || 'Trening', performed_on: performedOn, notes, exercises,
      plan_id: draft?.plan_id, day_key: draft?.day_key, started: true,
      // Nie zaliczaj czasu spędzonego w sklepie ani poza treningiem do czasu sesji.
      started_at: Date.now() - Math.max(0, elapsedSeconds) * 1000,
    };
    try {
      await request('/api/v2/training/draft', { method: 'PUT', body: JSON.stringify({ draft: pausedDraft }) });
      setDraft(pausedDraft);
      setSessionActive(false);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? `Nie udało się zachować treningu do późniejszego wznowienia: ${e.message}` : 'Nie udało się zachować treningu do późniejszego wznowienia.');
      return false;
    }
  };

  const navigateFromWorkoutPromo = async (destination: 'store' | 'premium') => {
    const saved = await pauseWorkout();
    if (!saved) return false;
    if (destination === 'store') onOpenStore?.();
    else onOpenPremium?.();
    return true;
  };

  if (loading) return <section className="sf-view"><p className="sf-muted">Ładowanie treningów…</p></section>;
  if (error && !plans.length && !active) return <section className="sf-view"><div className="sf-wm-empty"><h2>Nie udało się załadować treningów</h2><p>{error}</p><button className="sf-wm-button sf-wm-button-primary" onClick={() => void load()}>Spróbuj ponownie</button></div></section>;

  if (summary) {
    return <WorkoutSummary
      title={title}
      durationLabel={formatDuration(elapsedSeconds)}
      exercises={exercises}
      onBackToDashboard={onBackToDashboard}
      onStartAnother={() => {
        setSummary(false); setSessionActive(false); setTitle(''); setNotes(''); setExercises([]);
        setDraft(null); setStartedAt(null); setElapsedSeconds(0); setError('');
      }}
    />;
  }

  if (active) {
    return <section className="sf-view">
      {error && <p role="alert" className="sf-wm-error">{error}</p>}
      <WorkoutSession
        title={title} elapsedLabel={formatDuration(elapsedSeconds)} exercises={exercises} notes={notes} saving={saving}
        onExercisesChange={setExercises} onNotesChange={setNotes}
        onFinish={() => void finish()} onCancel={() => void pauseWorkout()}
        isPremium={isPremium} promoSessionId={`${draft?.plan_id || title}:${draft?.day_key || performedOn}:${performedOn}`} onPromoNavigate={navigateFromWorkoutPromo}
      />
    </section>;
  }

  const availablePlans = [...plans, ...SAMPLE_PLANS.map(plan => ({ ...plan, start_date: plan.start_date || sampleProgramStartDate(plan.id), duration_weeks: plan.duration_weeks || PROGRAM_WEEKS, progression_strategy: plan.progression_strategy || 'reps' }))];
  return <section className="sf-view">
    {error && <p role="alert" className="sf-wm-error">{error}</p>}
    <WorkoutLanding
      plans={availablePlans}
      activeDraft={draft}
      loading={saving}
      onStart={start}
      onResume={resume}
      onGoToPlans={onGoToPlans}
    />
  </section>;
}
