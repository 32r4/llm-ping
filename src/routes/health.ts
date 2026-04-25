import type { Context } from "hono";

export const handleHealth = (c: Context) =>
  c.json({
    ok: true,
    service: "llm-ping",
    now: new Date().toISOString()
  });
