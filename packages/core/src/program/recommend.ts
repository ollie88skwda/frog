// Questionnaire → template (F8). Pure and tested; the wizard's answers screen
// calls it and always shows the result on the review screen before saving.

import { PROGRAM_TEMPLATES } from "./templates";
import type { BuilderAnswers, ProgramTemplate } from "./types";

export const DEFAULT_ANSWERS: BuilderAnswers = {
  schedule: { kind: "interval", everyDays: 2 },
  goal: "muscle",
  status: "intermediate",
  equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
  minutes: 60,
};

/** "legacy" means the older UL/PPL generator ("More templates"). */
export type ProgramRecommendation =
  | { kind: "template"; template: ProgramTemplate }
  | { kind: "legacy" };

export function recommendTemplate(a: BuilderAnswers): ProgramRecommendation {
  const byId = (id: string) =>
    PROGRAM_TEMPLATES.find((t) => t.id === id) as ProgramTemplate;
  if (a.schedule.kind === "interval") {
    return { kind: "template", template: byId("frog-default") };
  }
  const days = a.schedule.days.length;
  if (days === 3) return { kind: "template", template: byId("research-b") };
  // Maintain scales the Frog default down (R18b); 2 days is a low-dose week.
  if (a.goal === "maintain" || days <= 2) {
    return { kind: "template", template: byId("frog-default") };
  }
  return { kind: "legacy" };
}
