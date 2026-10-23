import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkoutLanding from './WorkoutLanding';
import WorkoutSession from './WorkoutSession';
import WorkoutSummary from './WorkoutSummary';
import type { WorkoutDraft, WorkoutExercise, WorkoutPlan, WorkoutPlanDay } from './workoutTypes';
import './workout.css';
import './workout-fix-extra.css';

type Props = {
  onGoToPlans: () => void;
  onBackToDashboard: () => void;
  onSaved: () => Promise<unknown> | unknown;
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

function exercisesForDay(day: WorkoutPlanDay): WorkoutExercise[] {
  return day.exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({
    name: exercise.name.trim(),
    notes: exercise.notes,
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
    name: 'Przykładowy trening w domu',
    description: 'Prosty trening z masą własnego ciała — bez specjalistycznego sprzętu.',
    days: [{
      day_key: 'home-a',
      title: 'Całe ciało — dom',
      exercises: [
        { name: 'Pompki', sets: 4, reps: 10 },
        { name: 'Przysiady', sets: 3, reps: 15 },
        { name: 'Wykroki', sets: 3, reps: 10 },
        { name: 'Plank (sekundy)', sets: 3, reps: 30 },
      ],
    }],
  },
  {
    id: 'sample:gym',
    name: 'Przykładowy trening na siłowni',
    description: 'Przykładowa sesja całego ciała. Dobierz ciężar do swoich możliwości.',
    days: [{
      day_key: 'gym-a',
      title: 'Całe ciało — siłownia',
      exercises: [
        { name: 'Wyciskanie na ławce', sets: 3, reps: 10, weight_kg: null },
        { name: 'Ściąganie drążka wyciągu', sets: 3, reps: 10, weight_kg: null },
        { name: 'Wypychanie nóg na suwnicy', sets: 3, reps: 12, weight_kg: null },
        { name: 'Wyciskanie hantli nad głowę', sets: 3, reps: 10, weight_kg: null },
      ],
    }],
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

export default function TrainingRoute({ onGoToPlans, onBackToDashboard, onSaved }: Props) {
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

  const active = Boolean(draft?.started && draft.plan_id && exercises.length && !summary);

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
    const nextExercises = exercisesForDay(day);
    if (!nextExercises.length) {
      setError('Ten dzień nie ma ćwiczeń. Dodaj je w kreatorze planów.');
      return;
    }
    const now = Date.now();
    const next: WorkoutDraft = {
      title: `${plan.name} — ${day.title}`.slice(0, 120),
      performed_on: localDate(), notes: '', exercises: nextExercises,
      plan_id: plan.id, day_key: day.day_key, started: true, started_at: now,
    };
    setDraft(next);
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
    const now = Date.now();
    const savedStart = Number(draft.started_at);
    const startTime = Number.isFinite(savedStart) && savedStart > 0 ? savedStart : now;
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

  const cancel = async () => {
    await request('/api/v2/training/draft', { method: 'DELETE' }).catch(() => {});
    setDraft(null);
    setTitle('');
    setNotes('');
    setExercises([]);
    setSummary(false);
    setStartedAt(null);
    setElapsedSeconds(0);
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
        setSummary(false); setTitle(''); setNotes(''); setExercises([]);
        setDraft(null); setStartedAt(null); setElapsedSeconds(0); setError('');
      }}
    />;
  }

  if (active) {
    return <section className="sf-view">
      <div className="sf-wm-live-timer" role="timer" aria-live="off">
        <span> <strong>●</strong> TRENING W TOKU</span>
        <strong>{formatDuration(elapsedSeconds)}</strong>
      </div>
      <div className="sf-wm-session-meta">
        <label>Nazwa treningu<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Data<input type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="sf-wm-error">{error}</p>}
      <WorkoutSession
        title={title} exercises={exercises} notes={notes} saving={saving}
        onExercisesChange={setExercises} onNotesChange={setNotes}
        onFinish={() => void finish()} onCancel={() => void cancel()}
      />
    </section>;
  }

  const availablePlans = [...plans, ...SAMPLE_PLANS];
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
