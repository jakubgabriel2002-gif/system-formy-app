import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkoutLanding from './WorkoutLanding';
import WorkoutSession from './WorkoutSession';
import WorkoutSummary from './WorkoutSummary';
import type { WorkoutDraft, WorkoutExercise, WorkoutPlan, WorkoutPlanDay } from './workoutTypes';
import './workout.css';

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
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Wystąpił błąd (${response.status}).`;
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

export default function TrainingRoute({ onGoToPlans, onBackToDashboard, onSaved }: Props) {
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [title, setTitle] = useState('');
  const [performedOn, setPerformedOn] = useState(localDate());
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
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
      const nextDraft = draftResult.draft?.started && draftResult.draft.plan_id ? draftResult.draft : null;
      setDraft(nextDraft);
      if (nextDraft) {
        setTitle(nextDraft.title || 'Trening');
        setPerformedOn(nextDraft.performed_on || localDate());
        setNotes(nextDraft.notes || '');
        setExercises(Array.isArray(nextDraft.exercises) ? nextDraft.exercises : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać danych treningowych.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = Boolean(draft?.started && draft.plan_id && exercises.length && !summary);
  const draftToSave = useMemo<WorkoutDraft | null>(() => active ? ({
    title, performed_on: performedOn, notes, exercises,
    plan_id: draft?.plan_id, day_key: draft?.day_key, started: true,
  }) : null, [active, title, performedOn, notes, exercises, draft?.plan_id, draft?.day_key]);

  useEffect(() => {
    if (!draftToSave || loading) return;
    const timer = window.setTimeout(() => {
      void request('/api/v2/training/draft', { method: 'PUT', body: JSON.stringify({ draft: draftToSave }) }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftToSave, loading]);

  const start = (plan: WorkoutPlan, dayKey: string) => {
    const day = plan.days.find((item) => item.day_key === dayKey);
    if (!day) return;
    const nextExercises = exercisesForDay(day);
    if (!nextExercises.length) { setError('Ten dzień nie ma ćwiczeń. Dodaj je w kreatorze planów.'); return; }
    const next: WorkoutDraft = { title: `${plan.name} — ${day.title}`.slice(0, 120), performed_on: localDate(), notes: '', exercises: nextExercises, plan_id: plan.id, day_key: day.day_key, started: true };
    setDraft(next); setTitle(next.title); setPerformedOn(next.performed_on); setNotes(''); setExercises(nextExercises); setStartedAt(Date.now()); setSummary(false); setError('');
    void request('/api/v2/training/draft', { method: 'PUT', body: JSON.stringify({ draft: next }) }).catch(() => {});
  };

  const resume = () => {
    if (!draft) return;
    setTitle(draft.title || 'Trening'); setPerformedOn(draft.performed_on || localDate()); setNotes(draft.notes || ''); setExercises(draft.exercises || []); setStartedAt(Date.now()); setSummary(false);
  };

  const finish = async () => {
    if (!exercises.some((exercise) => exercise.name.trim())) { setError('Dodaj co najmniej jedno ćwiczenie.'); return; }
    setSaving(true); setError('');
    try {
      await request('/api/v2/training/sessions', { method: 'POST', body: JSON.stringify({ title: title || 'Trening', performed_on: performedOn, notes, exercises: exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({ ...exercise, name: exercise.name.trim() })) }) });
      await request('/api/v2/training/draft', { method: 'DELETE' }).catch(() => {});
      setDraft(null); setSummary(true); await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się zapisać treningu.'); }
    finally { setSaving(false); }
  };

  const cancel = async () => {
    await request('/api/v2/training/draft', { method: 'DELETE' }).catch(() => {});
    setDraft(null); setTitle(''); setNotes(''); setExercises([]); setSummary(false); setStartedAt(null);
  };

  if (loading) return <section className="sf-view"><p className="sf-muted">Ładowanie treningów…</p></section>;
  if (error && !plans.length && !active) return <section className="sf-view"><div className="sf-wm-empty"><h2>Nie udało się załadować treningów</h2><p>{error}</p><button className="sf-wm-button sf-wm-button-primary" onClick={() => void load()}>Spróbuj ponownie</button></div></section>;
  if (summary) {
    const elapsed = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000)) : 0;
    return <WorkoutSummary title={title} durationLabel={elapsed ? `${elapsed} min` : undefined} exercises={exercises} onBackToDashboard={onBackToDashboard} onStartAnother={() => { setSummary(false); setTitle(''); setNotes(''); setExercises([]); setDraft(null); setStartedAt(null); }} />;
  }
  if (active) return <section className="sf-view"><div className="sf-wm-session-meta"><label>Nazwa treningu<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label><label>Data<input type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} /></label></div>{error && <p role="alert" className="sf-wm-error">{error}</p>}<WorkoutSession title={title} exercises={exercises} notes={notes} saving={saving} onExercisesChange={setExercises} onNotesChange={setNotes} onFinish={() => void finish()} onCancel={() => void cancel()} /></section>;
  return <section className="sf-view">{error && <p role="alert" className="sf-wm-error">{error}</p>}<WorkoutLanding plans={plans} activeDraft={draft} loading={saving} onStart={start} onResume={resume} />{!plans.length && <div className="sf-wm-empty"><button className="sf-wm-button sf-wm-button-primary" onClick={onGoToPlans}>Przejdź do planów</button></div>}</section>;
}
