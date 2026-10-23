export type WorkoutSet = {
  reps: number;
  weight_kg: number | null;
  completed?: boolean;
};

export type WorkoutExercise = {
  name: string;
  sets_detail: WorkoutSet[];
  notes?: string;
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
