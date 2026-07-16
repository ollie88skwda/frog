export const KG_PER_LB = 0.45359237;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

const round05 = (n: number) => Math.round(n * 2) / 2;

export function toDisplayWeight(kg: number, unit: "kg" | "lb"): number {
  return round05(unit === "kg" ? kg : kgToLb(kg));
}
// Display label for a unit: pounds are plural ("lbs"), since a set is almost
// always more than one pound. Stored/typed value stays "lb".
export function unitLabel(unit: "kg" | "lb"): string {
  return unit === "lb" ? "lbs" : "kg";
}
export function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return `${toDisplayWeight(kg, unit)} ${unitLabel(unit)}`;
}

// Distance (canonical meters) — km/mi display for cardio exercise types.
export const M_PER_MI = 1609.344;
export const miToM = (mi: number) => mi * M_PER_MI;
export const kmToM = (km: number) => km * 1000;

export function toDisplayDistance(m: number, unit: "km" | "mi"): number {
  const v = unit === "km" ? m / 1000 : m / M_PER_MI;
  return Math.round(v * 100) / 100;
}
export function formatDistance(m: number, unit: "km" | "mi"): string {
  return `${toDisplayDistance(m, unit)} ${unit}`;
}

// Body measurements (canonical cm) — cm/in display for girths.
export const CM_PER_IN = 2.54;
export const inToCm = (inch: number) => inch * CM_PER_IN;

export function toDisplayLength(cm: number, unit: "cm" | "in"): number {
  const v = unit === "cm" ? cm : cm / CM_PER_IN;
  return Math.round(v * 10) / 10; // 0.1 precision per spec
}
export function formatLength(cm: number, unit: "cm" | "in"): string {
  return `${toDisplayLength(cm, unit)} ${unit}`;
}
