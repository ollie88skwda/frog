// Shared by post-save-summary.tsx and history-detail.tsx — both need the
// same "which workout number is this" arithmetic for the session card's
// eyebrow ("Experiment #47"), and it's easy for the two to quietly drift if each
// hand-rolls it.
export function ordinalFor(
  allSessions: Array<{ id: string; startedAt: number }>,
  sessionId: string,
  startedAt: number,
): number {
  const earlierOrEqual = allSessions.filter(
    (s) => s.startedAt <= startedAt,
  ).length;
  const present = allSessions.some((s) => s.id === sessionId);
  return Math.max(1, present ? earlierOrEqual : earlierOrEqual + 1);
}
