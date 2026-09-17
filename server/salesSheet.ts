/**
 * Sales-sheet export.
 *
 * Pushes customer / address / city / appointment date from an inspection into the
 * inspector's own monthly sales sheet (e.g. "John E 2026 - Automated (Sheet)").
 * Only columns A–D are written, so every formula column downstream is untouched.
 */
import {
  driveListSpreadsheets,
  spreadsheetTabs,
  valuesGet,
  valuesUpdate,
} from "./google";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Spreadsheets in the user's Drive that look like sales sheets. */
export async function listCandidateSheets(): Promise<
  { id: string; name: string; modifiedTime: string }[]
> {
  return driveListSpreadsheets();
}

/** Tab names present in a spreadsheet. */
export async function sheetTabs(spreadsheetId: string): Promise<string[]> {
  return spreadsheetTabs(spreadsheetId);
}

function monthTabFor(dateStr: string, tabs: string[]): string | null {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const month = MONTHS[Number.isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth()];
  const exact = tabs.find((t) => t.trim().toLowerCase() === month.toLowerCase());
  if (exact) return exact;
  const partial = tabs.find((t) => t.toLowerCase().includes(month.slice(0, 3).toLowerCase()));
  return partial ?? null;
}

/** US-style date the sheet already uses (9/1/2026). */
function usDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${m}/${d}/${y}`;
}

export type ExportInput = {
  spreadsheetId: string;
  inspectionDate: string;
  clientName: string;
  address: string;
  city: string;
};

export type ExportResult = {
  tab: string;
  row: number;
  range: string;
  spreadsheetId: string;
  values: string[];
};

/**
 * Append one job to the correct month tab, in the first row whose Customer cell
 * is empty, so existing rows and formulas are never disturbed.
 */
export async function exportToSalesSheet(input: ExportInput): Promise<ExportResult> {
  const { spreadsheetId } = input;
  const tabs = await sheetTabs(spreadsheetId);
  if (!tabs.length) throw new Error("That spreadsheet has no tabs we can read.");

  const tab = monthTabFor(input.inspectionDate, tabs);
  if (!tab) {
    throw new Error(
      `No month tab found in that sheet for ${input.inspectionDate || "today"}. Expected tabs named January–December.`
    );
  }

  const rows: string[][] = await valuesGet(spreadsheetId, `${tab}!A1:D400`);

  // Header row: first row whose first cell reads like "Customer".
  let headerRow = 0;
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const cell = (rows[r]?.[0] ?? "").toString().trim().toLowerCase();
    if (cell.startsWith("customer") || cell.startsWith("client")) {
      headerRow = r + 1;
      break;
    }
  }
  if (!headerRow) headerRow = 1;

  const target = (input.clientName || "").trim().toLowerCase();
  const targetDate = usDate(input.inspectionDate);
  let firstEmpty = 0;
  for (let r = headerRow; r < 400; r++) {
    const row = rows[r] ?? [];
    const name = (row[0] ?? "").toString().trim();
    if (!name) {
      firstEmpty = r + 1; // 1-based sheet row
      break;
    }
    if (
      target &&
      name.toLowerCase() === target &&
      (row[3] ?? "").toString().trim() === targetDate
    ) {
      throw new Error(
        `${input.clientName} on ${targetDate} is already on the ${tab} tab (row ${r + 1}).`
      );
    }
  }
  if (!firstEmpty) throw new Error(`No empty row left on the ${tab} tab.`);

  const values = [input.clientName, input.address, input.city, targetDate];
  const range = `${tab}!A${firstEmpty}:D${firstEmpty}`;
  await valuesUpdate(spreadsheetId, range, [values]);

  return { tab, row: firstEmpty, range, spreadsheetId, values };
}
