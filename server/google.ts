/**
 * Google API access for Drive + Sheets.
 *
 * Two transports, picked automatically:
 *  1. Service account  — used whenever a key is configured (GOOGLE_SERVICE_ACCOUNT_JSON
 *     or GOOGLE_SERVICE_ACCOUNT_FILE, e.g. a Render secret file at /etc/secrets/...).
 *     This is the hosted path: no expiry, no operator present.
 *  2. `gws` CLI        — used in the development sandbox, where Google access is
 *     already provided to the process by the platform.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

type ServiceAccount = { client_email: string; private_key: string };

let cachedKey: ServiceAccount | null | undefined;

function serviceAccount(): ServiceAccount | null {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = null;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  let raw = "";
  try {
    if (file) raw = readFileSync(file, "utf8");
    else if (inline)
      raw = inline.startsWith("{")
        ? inline
        : Buffer.from(inline, "base64").toString("utf8");
  } catch {
    raw = "";
  }
  if (!raw) return cachedKey;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.client_email && parsed?.private_key) {
      cachedKey = {
        client_email: String(parsed.client_email),
        private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
      };
    }
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export function googleMode(): "service-account" | "sandbox" {
  return serviceAccount() ? "service-account" : "sandbox";
}

/** Address the customer must share each sales sheet with, when hosted. */
export function serviceAccountEmail(): string {
  return serviceAccount()?.client_email ?? "";
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const key = serviceAccount();
  if (!key) throw new Error("No Google service account is configured.");
  const now = Math.floor(Date.now() / 1000);
  if (token && token.expiresAt - 60 > now) return token.value;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(key.private_key, "base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) {
    throw new Error(
      `Google sign-in failed: ${body?.error_description ?? body?.error ?? res.status}`
    );
  }
  token = {
    value: String(body.access_token),
    expiresAt: now + Number(body.expires_in ?? 3600),
  };
  return token.value;
}

async function rest(
  method: "GET" | "PUT",
  url: string,
  body?: unknown
): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? `Google API error ${res.status}`;
    throw new Error(String(msg).slice(0, 400));
  }
  return json;
}

function gws(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(
      "gws",
      args,
      { maxBuffer: 20 * 1024 * 1024, timeout: 45_000 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = String(stderr || err.message).trim();
          reject(new Error(msg.slice(0, 600) || "Google request failed"));
          return;
        }
        try {
          resolve(stdout.trim() ? JSON.parse(stdout) : {});
        } catch {
          reject(new Error("Unexpected response from Google."));
        }
      }
    );
  });
}

const qs = (params: Record<string, string | number>) =>
  new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();

/** Spreadsheets visible to us: the whole Drive in sandbox, shared files when hosted. */
export async function driveListSpreadsheets(): Promise<
  { id: string; name: string; modifiedTime: string }[]
> {
  const params = {
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 100,
    orderBy: "modifiedTime desc",
    fields: "files(id,name,modifiedTime)",
  };
  const res =
    googleMode() === "service-account"
      ? await rest(
          "GET",
          `https://www.googleapis.com/drive/v3/files?${qs({
            ...params,
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
          })}`
        )
      : await gws(["drive", "files", "list", "--params", JSON.stringify(params)]);
  return (res?.files ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime ?? "",
  }));
}

export async function spreadsheetTabs(spreadsheetId: string): Promise<string[]> {
  const fields = "sheets(properties(title))";
  const res =
    googleMode() === "service-account"
      ? await rest(
          "GET",
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}?${qs({ fields })}`
        )
      : await gws([
          "sheets",
          "spreadsheets",
          "get",
          "--params",
          JSON.stringify({ spreadsheetId, fields }),
        ]);
  return (res?.sheets ?? [])
    .map((s: any) => s?.properties?.title)
    .filter(Boolean);
}

export async function valuesGet(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res =
    googleMode() === "service-account"
      ? await rest(
          "GET",
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${encodeURIComponent(range)}?${qs({
            majorDimension: "ROWS",
          })}`
        )
      : await gws([
          "sheets",
          "spreadsheets",
          "values",
          "get",
          "--params",
          JSON.stringify({ spreadsheetId, range, majorDimension: "ROWS" }),
        ]);
  return res?.values ?? [];
}

export async function valuesUpdate(
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<void> {
  if (googleMode() === "service-account") {
    await rest(
      "PUT",
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(range)}?${qs({
        valueInputOption: "USER_ENTERED",
      })}`,
      { values }
    );
    return;
  }
  await gws([
    "sheets",
    "spreadsheets",
    "values",
    "update",
    "--params",
    JSON.stringify({ spreadsheetId, range, valueInputOption: "USER_ENTERED" }),
    "--json",
    JSON.stringify({ values }),
  ]);
}
