import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export interface APIRequestLogRecord {
  id: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  limited: boolean;
  clientId: string;
  error: string;
  createdAt: string;
}

interface RateLimitConfig {
  bucket: string;
  maxRequests: number;
  windowMs: number;
}

interface RouteProtectionConfig {
  errorMessage: string;
  rateLimit: RateLimitConfig;
  route: string;
}

type RouteHandler<T extends unknown[]> = (...args: T) => Promise<Response> | Response;

const DATA_DIR = path.join(process.cwd(), "data");
const API_REQUEST_LOG_FILE = () => process.env.API_REQUEST_LOG_FILE?.trim() || path.join(DATA_DIR, "api-requests.json");
const MAX_STORED_REQUEST_LOGS = 500;
const rateLimitState = new Map<string, RateLimitWindow>();

export function withRouteProtection<T extends [Request, ...unknown[]]>(handler: RouteHandler<T>, config: RouteProtectionConfig): RouteHandler<T> {
  return async (...args: T) => {
    const request = args[0];
    const startedAt = Date.now();
    const clientId = getClientIdentifier(request);
    const limit = consumeRateLimit(clientId, config.rateLimit);

    if (limit.limited) {
      const response = withRateLimitHeaders(
        NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
        config.rateLimit,
        limit.remaining,
        limit.resetAt
      );
      await appendAPIRequestLog({
        route: config.route,
        method: request.method,
        status: 429,
        durationMs: Date.now() - startedAt,
        limited: true,
        clientId,
        error: "rate_limit_exceeded",
      });
      return response;
    }

    try {
      const response = await handler(...args);
      const nextResponse = withRateLimitHeaders(response, config.rateLimit, limit.remaining, limit.resetAt);
      await appendAPIRequestLog({
        route: config.route,
        method: request.method,
        status: nextResponse.status,
        durationMs: Date.now() - startedAt,
        limited: false,
        clientId,
        error: "",
      });
      return nextResponse;
    } catch (error) {
      const response = withRateLimitHeaders(
        NextResponse.json(
          { error: error instanceof Error ? error.message : config.errorMessage },
          { status: 500 }
        ),
        config.rateLimit,
        limit.remaining,
        limit.resetAt
      );
      await appendAPIRequestLog({
        route: config.route,
        method: request.method,
        status: 500,
        durationMs: Date.now() - startedAt,
        limited: false,
        clientId,
        error: error instanceof Error ? error.message : config.errorMessage,
      });
      return response;
    }
  };
}

export async function listRecentAPIRequestLogs(limit = 50): Promise<APIRequestLogRecord[]> {
  const records = await readAPIRequestLogs();
  return records.slice(0, normalizeLimit(limit));
}

export function resetAPIRateLimits(): void {
  rateLimitState.clear();
}

function consumeRateLimit(clientId: string, config: RateLimitConfig): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `${config.bucket}:${clientId}`;
  const current = rateLimitState.get(key);

  if (!current || current.resetAt <= now) {
    const next: RateLimitWindow = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitState.set(key, next);
    return {
      limited: false,
      remaining: Math.max(config.maxRequests - next.count, 0),
      resetAt: next.resetAt,
    };
  }

  if (current.count >= config.maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  rateLimitState.set(key, current);
  return {
    limited: false,
    remaining: Math.max(config.maxRequests - current.count, 0),
    resetAt: current.resetAt,
  };
}

function withRateLimitHeaders(response: Response, config: RateLimitConfig, remaining: number, resetAt: number): Response {
  const nextResponse = response instanceof NextResponse ? response : new NextResponse(response.body, response);
  nextResponse.headers.set("X-RateLimit-Limit", String(config.maxRequests));
  nextResponse.headers.set("X-RateLimit-Remaining", String(Math.max(remaining, 0)));
  nextResponse.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  return nextResponse;
}

function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-agent";
  const seed = `${forwarded || realIp || "local"}:${userAgent}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

async function appendAPIRequestLog(input: Omit<APIRequestLogRecord, "id" | "createdAt">): Promise<void> {
  try {
    const records = await readAPIRequestLogs();
    const next: APIRequestLogRecord[] = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...input,
      },
      ...records,
    ].slice(0, MAX_STORED_REQUEST_LOGS);
    await fs.mkdir(path.dirname(API_REQUEST_LOG_FILE()), { recursive: true });
    await fs.writeFile(API_REQUEST_LOG_FILE(), JSON.stringify(next, null, 2));
  } catch {
  }
}

async function readAPIRequestLogs(): Promise<APIRequestLogRecord[]> {
  try {
    const raw = await fs.readFile(API_REQUEST_LOG_FILE(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAPIRequestLogRecord) : [];
  } catch {
    return [];
  }
}

function isAPIRequestLogRecord(value: unknown): value is APIRequestLogRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.route === "string" &&
    typeof record.method === "string" &&
    typeof record.status === "number" &&
    typeof record.durationMs === "number" &&
    typeof record.limited === "boolean" &&
    typeof record.clientId === "string" &&
    typeof record.error === "string" &&
    typeof record.createdAt === "string"
  );
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(Math.max(Math.floor(limit), 1), 200);
}

export const API_RATE_LIMITS = {
  aiRead: {
    bucket: "ai-read",
    maxRequests: 30,
    windowMs: 60_000,
  },
  aiWrite: {
    bucket: "ai-write",
    maxRequests: 12,
    windowMs: 60_000,
  },
  projectMutations: {
    bucket: "project-mutations",
    maxRequests: 40,
    windowMs: 60_000,
  },
  projectReads: {
    bucket: "project-reads",
    maxRequests: 120,
    windowMs: 60_000,
  },
  githubReads: {
    bucket: "github-reads",
    maxRequests: 60,
    windowMs: 60_000,
  },
  githubScans: {
    bucket: "github-scans",
    maxRequests: 12,
    windowMs: 60_000,
  },
  githubWrites: {
    bucket: "github-writes",
    maxRequests: 12,
    windowMs: 60_000,
  },
  proxy: {
    bucket: "proxy",
    maxRequests: 90,
    windowMs: 60_000,
  },
} as const;
