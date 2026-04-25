import { AppError } from "../errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const buckets = new Map<string, number[]>();

export const consumeRateLimit = (key: string, now = Date.now()) => {
  const entries = buckets.get(key) ?? [];
  const active = entries.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (active.length >= MAX_REQUESTS) {
    throw new AppError("permission_denied", "Too many requests. Please try again in a minute.", 429);
  }

  active.push(now);
  buckets.set(key, active);
};

export const getRateLimitKey = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "anonymous";
