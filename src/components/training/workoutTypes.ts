export type WorkoutSet = {
  reps: number;
  weight_kg: number | null;
  completed?: boolean;
};

export type WorkoutExercise = {
  name: string;
  sets_detail: WorkoutSet[];
  notes?: string;
  progression_note?: string;
  rest_seconds?: number;
  transition_rest_seconds?: number;
};

export type WorkoutPlanDay = {
  day_key: string;
  title: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    weight_kg?: number | null;
    notes?: string;
    rest_seconds?: number;
    transition_rest_seconds?: number;
  }>;
};

export type WorkoutPlan = {
  id: string;
  name: string;
  description?: string;
  days: WorkoutPlanDay[];
  duration_weeks?: number;
  start_date?: string | null;
  progression_strategy?: 'reps' | 'weight' | 'sets' | 'none';
};

export type WorkoutDraft = {
  title: string;
  performed_on: string;
  notes: string;
  exercises: WorkoutExercise[];
  plan_id?: string;
  day_key?: string;
  started?: boolean;
  started_at?: number | null;
};
