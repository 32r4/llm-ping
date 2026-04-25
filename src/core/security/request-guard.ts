import { consumeRateLimit, getRateLimitKey } from "./rate-limit";

export const applyRequestGuard = (request: Request) => {
  const key = getRateLimitKey(request);
  consumeRateLimit(key);
};
