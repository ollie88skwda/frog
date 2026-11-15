import type { SnapshotOverride } from "@frog/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useRepo } from "@/lib/repo";
import { userFacingRepoError } from "@/lib/repo-error";

/** Start-a-session flow shared by Home (quick start) and Training (hub). */
export function useStartSession() {
  const repo = useRepo();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await repo.startSession();
      void qc.invalidateQueries({ queryKey: ["active-session"] });
      navigate(`/session/${session.id}`);
    } catch (e) {
      // Train's start card prints this string verbatim (screens/train.tsx),
      // which makes it the one place in the app where a raw exception message
      // reaches a user — an unreachable database used to surface here as the
      // literal "TypeError: Failed to fetch". docs/DECISIONS.md 2026-08-25.
      setError(userFacingRepoError(e));
      setStarting(false);
    }
  }

  return { start, starting, error };
}

/**
 * Start a session from a routine, writing the per-exercise target snapshot
 * (redesign §9.1) server-side in the same mutation. `prescriptions` is the
 * coach output keyed by routine_exercise id (F4); without it the snapshot is
 * the routine's own targets. Callers (Today, Plan, Trainer) own navigation.
 */
export function useStartRoutineSession() {
  const repo = useRepo();
  const qc = useQueryClient();
  return async function startRoutine(
    routineId: string,
    prescriptions?: Record<string, SnapshotOverride>,
  ) {
    const session = await repo.startRoutineSession(routineId, prescriptions);
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    return session;
  };
}
