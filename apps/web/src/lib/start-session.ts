import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useRepo } from "@/lib/repo";

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
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  return { start, starting, error };
}
