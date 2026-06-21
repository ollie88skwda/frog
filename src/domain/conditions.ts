export type MetricType = "number" | "scale" | "text" | "checkbox";
export type MetricScope = "set" | "session";
export type ConditionValue = number | string | boolean;
export type ConditionMap = Record<string, ConditionValue>;

export function encodeConditions(values: ConditionMap): string {
  return JSON.stringify(values);
}

export function decodeConditions(json: string | null | undefined): ConditionMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ConditionMap;
    }
  } catch {}
  return {};
}

export function validateConditionValue(type: MetricType, value: unknown): ConditionValue | null {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "number": {
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
    case "scale": {
      const s = Math.round(Number(value));
      return isNaN(s) || s < 1 || s > 10 ? null : s;
    }
    case "text":
      return typeof value === "string" ? value : String(value);
    case "checkbox":
      return Boolean(value);
  }
}

export function mergeConditions(existing: ConditionMap, patch: Partial<ConditionMap>): ConditionMap {
  const result: ConditionMap = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}
