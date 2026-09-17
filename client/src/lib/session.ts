export type SessionUser = { id: number; name: string; role: string; cert?: string };

const KEY = "airtrace_inspector";

/** In-memory copy so the session survives navigation even where cookies are blocked. */
let memory: SessionUser | null = null;

function readCookie(): string | null {
  try {
    const hit = document.cookie
      .split("; ")
      .find((c) => c.startsWith(KEY + "="));
    return hit ? decodeURIComponent(hit.slice(KEY.length + 1)) : null;
  } catch {
    return null;
  }
}

function writeCookie(value: string | null): void {
  try {
    document.cookie = value
      ? `${KEY}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=None; Secure`
      : `${KEY}=; path=/; max-age=0; SameSite=None; Secure`;
  } catch {
    /* cookies unavailable — memory only */
  }
}

function parse(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === "number" && typeof parsed?.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function getSession(): SessionUser | null {
  if (memory) return memory;
  memory = parse(readCookie());
  return memory;
}

export function setSession(user: SessionUser | null): void {
  memory = user;
  writeCookie(user ? JSON.stringify(user) : null);
}

export function sessionHeaders(): Record<string, string> {
  const user = getSession();
  return user ? { "x-inspector-id": String(user.id) } : {};
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin";
}

/** Owner or admin may edit. Records with no owner (created before sign-in) stay editable. */
export function canEdit(
  inspection: { ownerId?: number | null } | undefined,
  user: SessionUser | null
): boolean {
  if (!user || !inspection) return false;
  if (user.role === "admin") return true;
  return !inspection.ownerId || inspection.ownerId === user.id;
}
