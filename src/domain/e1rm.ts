// Epley estimated 1RM. Note: unreliable for high-rep isolation work; treat as a trend proxy, not a true max.
export function epley(weightKg: number, reps: number): number | null {
  if (!weightKg || !reps) return null;
  return weightKg * (1 + reps / 30);
}
