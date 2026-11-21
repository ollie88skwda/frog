// Which side of a unilateral set the user does first. A device preference
// (not account data), default left.

export type FirstSide = "left" | "right";

const KEY = "frog.firstSide";

export function loadFirstSide(): FirstSide {
  try {
    return localStorage.getItem(KEY) === "right" ? "right" : "left";
  } catch {
    return "left";
  }
}

export function saveFirstSide(side: FirstSide): void {
  try {
    localStorage.setItem(KEY, side);
  } catch {
    // best-effort
  }
}

export function otherSide(side: FirstSide): FirstSide {
  return side === "left" ? "right" : "left";
}
