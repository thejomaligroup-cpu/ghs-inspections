import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";

const run = promisify(execFile);

export type ParsedCount = {
  organism: string;
  rawCount: number | null;
  perM3: number | null;
};
export type ParsedSample = {
  sampleLabel: string;
  location: string;
  sampleType: string;
  volumeL: number | null;
  notes: string;
  counts: ParsedCount[];
};
export type ParsedReport = {
  labName: string;
  labReportNo: string;
  dateAnalyzed: string;
  analyst: string;
  samples: ParsedSample[];
  sourceText: string;
};

const SYSTEM = `You read mold and indoor air quality laboratory reports (spore trap / direct exam analyses) and convert them into JSON.

Return ONLY a JSON object, no prose, no markdown fences, shaped exactly:
{
  "labName": string,
  "labReportNo": string,
  "dateAnalyzed": string,        // ISO yyyy-mm-dd if determinable, else ""
  "analyst": string,
  "samples": [
    {
      "sampleLabel": string,     // the lab's sample ID exactly as printed, e.g. "S-02" or "AIR-3"
      "location": string,        // room/area description if printed
      "sampleType": string,      // one of: Indoor Air, Outdoor Control, Wall Cavity, Surface Tape Lift, Swab, Bulk / Dust
      "volumeL": number | null,  // air volume in litres if printed (75 for 15 L/min x 5 min)
      "notes": string,           // lab comments for this sample: background debris, overloading, obscuration
      "counts": [
        { "organism": string, "rawCount": number | null, "perM3": number | null }
      ]
    }
  ]
}

Rules:
- Use the lab's own organism names, but normalise the combined genus to "Aspergillus/Penicillium".
- rawCount is the counted spores/structures on the trace. perM3 is the reported concentration per cubic metre. Include whichever the report gives; use null for the other.
- If the report gives per-m3 only, leave rawCount null. Never invent numbers, never compute values the report does not state.
- Skip rows that are zero/none-detected ONLY if the report itself omits them; if it lists them as 0 or "ND", include them with rawCount 0.
- Do not include a "Total" row unless the report prints a total; if it does, name it "Total spores".
- Outdoor/exterior/control samples must get sampleType "Outdoor Control".
- If the document is not a mold lab report, return {"labName":"","labReportNo":"","dateAnalyzed":"","analyst":"","samples":[]}.`;

function extractJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function pdfText(buf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lab-"));
  const src = join(dir, "in.pdf");
  const out = join(dir, "out.txt");
  try {
    await writeFile(src, buf);
    await run("pdftotext", ["-layout", src, out]);
    return await readFile(out, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sheetText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return `--- sheet: ${name} ---\n${csv}`;
  }).join("\n\n");
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: any): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function normalise(raw: any, sourceText: string): ParsedReport {
  const samples: ParsedSample[] = Array.isArray(raw?.samples)
    ? raw.samples.map((s: any) => ({
        sampleLabel: str(s?.sampleLabel),
        location: str(s?.location),
        sampleType: str(s?.sampleType),
        volumeL: num(s?.volumeL),
        notes: str(s?.notes),
        counts: Array.isArray(s?.counts)
          ? s.counts
              .map((c: any) => ({
                organism: str(c?.organism),
                rawCount: num(c?.rawCount),
                perM3: num(c?.perM3),
              }))
              .filter((c: ParsedCount) => c.organism !== "")
          : [],
      }))
    : [];
  return {
    labName: str(raw?.labName),
    labReportNo: str(raw?.labReportNo),
    dateAnalyzed: str(raw?.dateAnalyzed),
    analyst: str(raw?.analyst),
    samples,
    sourceText: sourceText.slice(0, 4000),
  };
}

/** Parse an uploaded lab report (PDF, spreadsheet, CSV, or photo/scan) into draft rows. */
export async function parseLabReport(
  buf: Buffer,
  fileName: string,
  mimeType: string
): Promise<ParsedReport> {
  const client = new Anthropic();
  const lower = fileName.toLowerCase();
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(lower);

  let content: any[];
  let sourceText = "";

  if (isImage) {
    const mediaType = mimeType.startsWith("image/")
      ? mimeType
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    content = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
      },
      { type: "text", text: "Convert this lab report page into the JSON schema." },
    ];
  } else {
    if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
      sourceText = await pdfText(buf);
    } else if (/\.(xlsx|xlsm|xls)$/.test(lower) || mimeType.includes("spreadsheet")) {
      sourceText = sheetText(buf);
    } else {
      sourceText = buf.toString("utf8");
    }
    sourceText = sourceText.replace(/\u0000/g, "").trim();
    if (sourceText.length < 20) {
      throw new Error(
        "No readable text found in that file. If it is a scanned report, upload it as an image (PNG or JPG) instead."
      );
    }
    content = [
      {
        type: "text",
        text: `Lab report file: ${fileName}\n\n${sourceText.slice(0, 60000)}`,
      },
    ];
  }

  const message = await client.messages.create({
    model: "claude_sonnet_4_6",
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  const text = message.content
    .map((b: any) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return normalise(extractJson(text), sourceText);
}
