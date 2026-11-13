import type { ProgramTemplate } from "../types";
import { FROG_DEFAULT } from "./frog-default";
import { RESEARCH_A } from "./research-a";
import { RESEARCH_B } from "./research-b";
import { RESEARCH_C } from "./research-c";

export { FROG_DEFAULT, RESEARCH_A, RESEARCH_B, RESEARCH_C };

/** Catalog order: the Frog default leads (F8). */
export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [
  FROG_DEFAULT,
  RESEARCH_A,
  RESEARCH_B,
  RESEARCH_C,
];

export function templateById(id: string): ProgramTemplate | undefined {
  return PROGRAM_TEMPLATES.find((t) => t.id === id);
}
