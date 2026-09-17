import type { Sample, LabResult } from "@shared/schema";
import { sampleVolume } from "./psych";

/** Common spore-trap taxa and non-fungal particulates, for quick entry. */
export const ORGANISM_PRESETS = [
  "Alternaria",
  "Ascospores",
  "Aspergillus/Penicillium",
  "Basidiospores",
  "Bipolaris/Drechslera",
  "Chaetomium",
  "Cladosporium",
  "Curvularia",
  "Epicoccum",
  "Fusarium",
  "Ganoderma",
  "Memnoniella",
  "Myxomycetes/Smuts",
  "Nigrospora",
  "Pithomyces",
  "Rusts",
  "Scopulariopsis",
  "Stachybotrys",
  "Torula",
  "Trichoderma",
  "Ulocladium",
  "Hyphal fragments",
  "Pollen",
  "Insect fragments",
  "Skin fragments",
  "Fibers",
  "Total spores",
];

/** Genera generally treated as water-damage indicators in a building. */
export const WATER_INDICATORS = new Set([
  "Stachybotrys",
  "Chaetomium",
  "Memnoniella",
  "Fusarium",
  "Ulocladium",
  "Trichoderma",
  "Scopulariopsis",
  "Acremonium",
  "Aspergillus/Penicillium",
]);

/** Non-fungal particulates that should not enter the indoor/outdoor totals. */
const NON_FUNGAL = new Set([
  "Pollen",
  "Insect fragments",
  "Skin fragments",
  "Fibers",
  "Total spores",
]);

export const AIR_TYPES = ["Indoor Air", "Outdoor Control", "Wall Cavity"];

/** Spores per cubic metre: raw count / litres sampled x 1000, unless the lab value is entered. */
export function perM3(result: LabResult, sample?: Sample): number | null {
  if (result.perM3Override != null) return result.perM3Override;
  const vol = sample ? sampleVolume(sample.calFlowLpm, sample.durationMin) : null;
  if (result.rawCount == null || !vol) return null;
  return (result.rawCount / vol) * 1000;
}

export type OrganismRow = {
  organism: string;
  indoor: number;
  outdoor: number;
  ratio: number | null;
  marker: boolean;
  tone: "ok" | "warn" | "bad";
  label: string;
};

/** Compare indoor air samples against the outdoor control, organism by organism. */
export function buildComparison(samples: Sample[], results: LabResult[]) {
  const byId = new Map(samples.map((s) => [s.id, s]));
  const outdoorIds = new Set(
    samples.filter((s) => s.sampleType === "Outdoor Control").map((s) => s.id)
  );
  const indoorIds = new Set(
    samples.filter((s) => s.sampleType === "Indoor Air").map((s) => s.id)
  );

  const indoor = new Map<string, number>();
  const outdoor = new Map<string, number>();

  for (const r of results) {
    const organism = r.organism.trim();
    if (!organism || NON_FUNGAL.has(organism)) continue;
    const v = perM3(r, byId.get(r.sampleRowId));
    if (v == null) continue;
    if (outdoorIds.has(r.sampleRowId)) {
      outdoor.set(organism, Math.max(outdoor.get(organism) ?? 0, v));
    } else if (indoorIds.has(r.sampleRowId)) {
      indoor.set(organism, Math.max(indoor.get(organism) ?? 0, v));
    }
  }

  const organisms = Array.from(
    new Set([...Array.from(indoor.keys()), ...Array.from(outdoor.keys())])
  );
  const rows: OrganismRow[] = organisms.map((organism) => {
    const i = indoor.get(organism) ?? 0;
    const o = outdoor.get(organism) ?? 0;
    const ratio = o > 0 ? i / o : i > 0 ? null : 0;
    const marker = WATER_INDICATORS.has(organism) && i > 0;

    let tone: OrganismRow["tone"] = "ok";
    let label = "Comparable to outdoor";
    if (o === 0 && i > 0) {
      tone = marker ? "bad" : "warn";
      label = "Indoor only — absent outdoors";
    } else if (ratio != null && ratio >= 5) {
      tone = "bad";
      label = "Substantially above outdoor";
    } else if (ratio != null && ratio >= 2) {
      tone = "warn";
      label = "Above outdoor";
    } else if (i === 0 && o > 0) {
      label = "Outdoor only";
    }
    if (marker && tone === "ok") {
      tone = "warn";
      label = "Water-damage indicator present";
    }

    return { organism, indoor: i, outdoor: o, ratio, marker, tone, label };
  });

  rows.sort((a, b) => b.indoor - a.indoor);

  const indoorTotal = Array.from(indoor.values()).reduce((s, v) => s + v, 0);
  const outdoorTotal = Array.from(outdoor.values()).reduce((s, v) => s + v, 0);
  const totalRatio = outdoorTotal > 0 ? indoorTotal / outdoorTotal : null;
  const markers = rows.filter((r) => r.marker).map((r) => r.organism);

  let verdict: { tone: "ok" | "warn" | "bad"; label: string; detail: string };
  if (rows.length === 0) {
    verdict = {
      tone: "warn",
      label: "Not enough data",
      detail:
        "Enter counts for at least one indoor air sample and one outdoor control to generate a comparison.",
    };
  } else if (outdoorTotal === 0) {
    verdict = {
      tone: "warn",
      label: "No outdoor baseline",
      detail:
        "Indoor counts cannot be interpreted without outdoor control results for the same day.",
    };
  } else if (markers.length > 0) {
    verdict = {
      tone: "bad",
      label: "Indoor amplification indicated",
      detail: `Water-damage indicator taxa found indoors: ${markers.join(
        ", "
      )}. Total indoor burden is ${totalRatio!.toFixed(1)}x the outdoor control.`,
    };
  } else if (totalRatio! >= 3) {
    verdict = {
      tone: "bad",
      label: "Indoor counts elevated",
      detail: `Total indoor spore burden is ${totalRatio!.toFixed(
        1
      )}x the outdoor control, suggesting an interior source.`,
    };
  } else if (totalRatio! >= 1.5) {
    verdict = {
      tone: "warn",
      label: "Mildly elevated indoors",
      detail: `Total indoor spore burden is ${totalRatio!.toFixed(
        1
      )}x the outdoor control. Review the taxa distribution alongside moisture readings.`,
    };
  } else {
    verdict = {
      tone: "ok",
      label: "Comparable to outdoor air",
      detail: `Total indoor spore burden is ${totalRatio!.toFixed(
        1
      )}x the outdoor control, with no water-damage indicator taxa reported indoors.`,
    };
  }

  return { rows, indoorTotal, outdoorTotal, totalRatio, markers, verdict };
}

export const fmtCount = (n: number | null) =>
  n == null ? "—" : n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
