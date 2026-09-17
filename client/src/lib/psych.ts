export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;

function satVaporPressureHpa(tempF: number) {
  const tc = fToC(tempF);
  return 6.1078 * Math.pow(10, (7.5 * tc) / (237.3 + tc));
}

/** Dew point in °F from dry-bulb °F and RH %. */
export function dewPointF(tempF: number | null, rh: number | null): number | null {
  if (tempF == null || rh == null || rh <= 0) return null;
  const pw = (rh / 100) * satVaporPressureHpa(tempF);
  const alpha = Math.log10(pw / 6.1078);
  return cToF((237.3 * alpha) / (7.5 - alpha));
}

/** Grains of moisture per pound of dry air. */
export function gpp(tempF: number | null, rh: number | null): number | null {
  if (tempF == null || rh == null || rh <= 0) return null;
  const pw = (rh / 100) * satVaporPressureHpa(tempF);
  const p = 1013.25;
  const w = (0.62198 * pw) / (p - pw);
  return w * 7000;
}

/** Condensation risk when a surface is at or below dew point. */
export function surfaceRisk(surfaceF: number | null, dewF: number | null) {
  if (surfaceF == null || dewF == null) return null;
  const delta = surfaceF - dewF;
  if (delta <= 0) return { label: "Condensing", tone: "bad" as const, delta };
  if (delta <= 5) return { label: "At risk", tone: "warn" as const, delta };
  return { label: "Dry", tone: "ok" as const, delta };
}

/** Elevated moisture relative to a dry standard. */
export function moistureStatus(moisture: number | null, dryStandard: number | null) {
  if (moisture == null) return null;
  const base = dryStandard ?? 16;
  if (moisture >= base * 1.5) return { label: "Wet", tone: "bad" as const };
  if (moisture > base) return { label: "Elevated", tone: "warn" as const };
  return { label: "Within dry standard", tone: "ok" as const };
}

export const num = (v: string): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const fmt = (n: number | null, digits = 1) =>
  n == null ? "—" : n.toFixed(digits);

/** Sample air volume in litres (flow L/min x minutes). */
export const sampleVolume = (flow: number | null, minutes: number | null) =>
  flow == null || minutes == null ? null : flow * minutes;
