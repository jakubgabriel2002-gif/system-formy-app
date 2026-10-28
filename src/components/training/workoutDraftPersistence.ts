import type { WorkoutDraft, WorkoutExercise } from './workoutTypes';

const STORAGE_PREFIX = 'sf-workout-draft-backup-v1:';

export type LocalWorkoutDraftSnapshot = {
  version: 1;
  user_id: string;
  saved_at: number;
  draft: WorkoutDraft;
};

export type DraftRestoreChoice = {
  draft: WorkoutDraft | null;
  source: 'server' | 'local' | 'none';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeWorkoutDraft(value: unknown): WorkoutDraft | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== 'string' || value.title.trim().length < 1 || value.title.length > 120) return null;
  if (!isDateOnly(value.performed_on)) return null;
  if (typeof value.notes !== 'string' || value.notes.length > 1000) return null;
  if (!Array.isArray(value.exercises) || value.exercises.length < 1 || value.exercises.length > 40) return null;

  const exercises: WorkoutExercise[] = [];
  for (const rawExercise of value.exercises) {
    if (!isRecord(rawExercise) || typeof rawExercise.name !== 'string') return null;
    const name = rawExercise.name.trim();
    if (!name || name.length > 120 || !Array.isArray(rawExercise.sets_detail) || rawExercise.sets_detail.length < 1 || rawExercise.sets_detail.length > 30) return null;
    const sets: WorkoutExercise['sets_detail'] = [];
    for (const rawSet of rawExercise.sets_detail) {
      if (!isRecord(rawSet)) return null;
      const reps = Number(rawSet.reps);
      const weight = rawSet.weight_kg == null || rawSet.weight_kg === '' ? null : Number(rawSet.weight_kg);
      if (!Number.isInteger(reps) || reps < 1 || reps > 200) return null;
      if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) return null;
      if (rawSet.completed !== undefined && typeof rawSet.completed !== 'boolean') return null;
      sets.push({ reps, weight_kg: weight, completed: rawSet.completed === true });
    }
    const notes = typeof rawExercise.notes === 'string' ? rawExercise.notes.slice(0, 1000) : undefined;
    const progressionNote = typeof rawExercise.progression_note === 'string' ? rawExercise.progression_note.slice(0, 1000) : undefined;
    const rest = rawExercise.rest_seconds == null ? undefined : Number(rawExercise.rest_seconds);
    const transitionRest = rawExercise.transition_rest_seconds == null ? undefined : Number(rawExercise.transition_rest_seconds);
    if ((rest !== undefined && (!Number.isInteger(rest) || rest < 0 || rest > 3600)) || (transitionRest !== undefined && (!Number.isInteger(transitionRest) || transitionRest < 0 || transitionRest > 3600))) return null;
    exercises.push({ name, sets_detail: sets, notes, progression_note: progressionNote, rest_seconds: rest, transition_rest_seconds: transitionRest });
  }

  const startedAt = value.started_at == null ? null : Number(value.started_at);
  if (startedAt !== null && (!Number.isFinite(startedAt) || startedAt <= 0)) return null;
  const planId = typeof value.plan_id === 'string' ? value.plan_id.slice(0, 120) : undefined;
  const dayKey = typeof value.day_key === 'string' ? value.day_key.slice(0, 30) : undefined;
  const completionKey = typeof value.completion_key === 'string' && /^[0-9a-f-]{36}$/i.test(value.completion_key) ? value.completion_key : undefined;
  return {
    title: value.title.trim(), performed_on: value.performed_on, notes: value.notes,
    exercises, plan_id: planId, day_key: dayKey, started: value.started === true,
    started_at: startedAt, completion_key: completionKey,
  };
}

export function parseLocalWorkoutDraftSnapshot(raw: string | null, userId: string): LocalWorkoutDraftSnapshot | null {
  if (!raw || !userId) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.user_id !== userId) return null;
    const savedAt = Number(value.saved_at);
    const draft = normalizeWorkoutDraft(value.draft);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || !draft) return null;
    return { version: 1, user_id: userId, saved_at: savedAt, draft };
  } catch {
    return null;
  }
}

export function chooseWorkoutDraftToRestore(
  serverDraft: unknown,
  serverUpdatedAt: string | null | undefined,
  localSnapshot: LocalWorkoutDraftSnapshot | null,
): DraftRestoreChoice {
  const server = normalizeWorkoutDraft(serverDraft);
  if (serverDraft == null) return { draft: null, source: 'none' };
  if (!server) return localSnapshot ? { draft: localSnapshot.draft, source: 'local' } : { draft: null, source: 'none' };
  const serverTimestamp = serverUpdatedAt ? Date.parse(serverUpdatedAt) : Number.NaN;
  if (localSnapshot && (!Number.isFinite(serverTimestamp) || localSnapshot.saved_at > serverTimestamp)) {
    return { draft: localSnapshot.draft, source: 'local' };
  }
  return { draft: server, source: 'server' };
}

export function readLocalWorkoutDraft(userId: string): LocalWorkoutDraftSnapshot | null {
  if (!userId || typeof window === 'undefined') return null;
  try { return parseLocalWorkoutDraftSnapshot(window.localStorage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`), userId); }
  catch { return null; }
}

export function saveLocalWorkoutDraft(userId: string, draft: WorkoutDraft, savedAt = Date.now()): boolean {
  if (!userId || typeof window === 'undefined') return false;
  const normalized = normalizeWorkoutDraft(draft);
  if (!normalized || !Number.isFinite(savedAt) || savedAt <= 0) return false;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`, JSON.stringify({ version: 1, user_id: userId, saved_at: savedAt, draft: normalized } satisfies LocalWorkoutDraftSnapshot));
    return true;
  } catch { return false; }
}

export function clearLocalWorkoutDraft(userId: string): void {
  if (!userId || typeof window === 'undefined') return;
  try { window.localStorage.removeItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`); } catch { /* local persistence is best-effort */ }
}
