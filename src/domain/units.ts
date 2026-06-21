export const KG_PER_LB = 0.45359237;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

const round05 = (n: number) => Math.round(n * 2) / 2;

export function toDisplayWeight(kg: number, unit: "kg" | "lb"): number {
  return round05(unit === "kg" ? kg : kgToLb(kg));
}
export function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return `${toDisplayWeight(kg, unit)} ${unit}`;
}
