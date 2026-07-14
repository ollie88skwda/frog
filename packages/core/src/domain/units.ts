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
