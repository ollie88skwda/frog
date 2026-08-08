/** Session-shaped input for the findings engine — plain data, no I/O. */
export type FindingsSessionInput = {
  sessionId: string;
  startedAt: number; // ms epoch
  conditionValues: Record<string, unknown> | null; // {metricId: value}
  sets: {
    exerciseId: string;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    // Effort/set-type context for recommendation stats (note 12). Optional:
    // absent means "not logged", matching the DB's nulls. The trend baseline
    // itself reads only weight/reps and is unchanged.
    setType?: string | null;
    rir?: number | null;
    rirMin?: number | null;
    rirMax?: number | null;
    rpe?: number | null;
  }[];
};

export type TrendFinding = {
  kind: "trend";
  exerciseId: string;
  exerciseName: string;
  verdict: "PROGRESSING" | "PLATEAU" | "REGRESSING";
  pctChange: number;
  perMonth: number;
  n: number;
  /** Days between the first and last session the verdict was fit over. */
  spanDays: number;
};

export type CountdownFinding = {
  kind: "countdown";
  exerciseId: string;
  exerciseName: string;
  sessionsLogged: number;
  sessionsNeeded: number; // remaining until a trend can be called
};

export type ConditionFinding = {
  kind: "condition";
  conditionId: string;
  conditionName: string;
  /** What was compared: overall session tonnage, or one exercise's top-set e1RM. */
  outcome:
    | { type: "tonnage" }
    | { type: "e1rm"; exerciseId: string; exerciseName: string };
  highMean: number;
  lowMean: number;
  /** Signed % difference of high-bucket mean vs low-bucket mean. */
  pctDiff: number;
  confidence: "low" | "medium";
  n: { high: number; low: number };
};

export type Finding = TrendFinding | CountdownFinding | ConditionFinding;
