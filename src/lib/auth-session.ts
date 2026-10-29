import { getDb, withTransaction } from "./db";

const SESSION_COOKIE_NAME = "cvesearch_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_THRESHOLD_SECONDS = SESSION_MAX_AGE_SECONDS - 60 * 60 * 24;

export interface WorkspaceSession {
  sessionId: string;
  userId: string;
  setCookieHeader?: string;
}

// Pass refresh: false where no Set-Cookie can be sent (server components), so the refresh is not used up.
export function getWorkspaceSession(request: Request, { refresh = true } = {}): WorkspaceSession | null {
  const existingSessionId = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!existingSessionId) {
    return null;
  }

  const now = Date.now();
  const existing = getDb().prepare(`
    SELECT id, user_id as userId, expires_at as expiresAt
    FROM sessions
    WHERE id = ? AND expires_at > ?
  `).get(existingSessionId, new Date(now).toISOString()) as { id: string; userId: string; expiresAt: string } | undefined;

  if (!existing) {
    return null;
  }

  // Sliding expiry, throttled: only extend once less than max age minus one day remains.
  if (!refresh || Date.parse(existing.expiresAt) - now >= SESSION_REFRESH_THRESHOLD_SECONDS * 1000) {
    return {
      sessionId: existing.id,
      userId: existing.userId,
    };
  }

  getDb().prepare(`UPDATE sessions SET expires_at = ? WHERE id = ?`)
    .run(new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString(), existing.id);

  return {
    sessionId: existing.id,
    userId: existing.userId,
    setCookieHeader: buildSessionCookie(existing.id),
  };
}

export function getOrCreateWorkspaceSession(request: Request): WorkspaceSession {
  const existing = getWorkspaceSession(request);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const sessionId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  withTransaction((db) => {
    db.prepare(`
      INSERT INTO users (id, display_name, created_at)
      VALUES (?, ?, ?)
    `).run(userId, "Workspace User", createdAt);

    db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, userId, createdAt, expiresAt);

    db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(createdAt);
  });

  return {
    sessionId,
    userId,
    setCookieHeader: buildSessionCookie(sessionId),
  };
}

function buildSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function applyWorkspaceSession(response: Response, session: WorkspaceSession): Response {
  if (session.setCookieHeader) {
    response.headers.append("Set-Cookie", session.setCookieHeader);
  }

  return response;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}
