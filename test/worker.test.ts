import { afterEach, describe, expect, it } from "vitest";

import app from "../src/worker";

const originalFetch = globalThis.fetch;

const makeJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });

const makeProbeRequest = (payload: unknown, ip: string) =>
  new Request("http://localhost/api/probe-models", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify(payload)
  });

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("worker /api/probe-models", () => {
  it("returns route-scoped auth errors from upstream", async () => {
    globalThis.fetch = (async () =>
      makeJsonResponse(
        {
          error: {
            message: "bad auth"
          }
        },
        401
      )) as typeof fetch;

    const response = await app.request(
      makeProbeRequest(
        {
          apiKey: "sk-test",
          baseUrl: "https://api.example.com",
          apiMode: "responses",
          modelIds: ["alpha"],
          messages: [{ role: "user", content: "ping" }]
        },
        "vitest-worker-auth"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      scope: "probe_models",
      error: {
        type: "auth_failed",
        message: "API key is invalid or missing."
      }
    });
  });

  it("rejects requests that exceed the route batch limit", async () => {
    const response = await app.request(
      makeProbeRequest(
        {
          apiKey: "sk-test",
          baseUrl: "https://api.example.com",
          apiMode: "responses",
          modelIds: Array.from({ length: 11 }, (_, index) => "model-" + index),
          messages: [{ role: "user", content: "ping" }]
        },
        "vitest-worker-limit"
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      scope: "probe_models",
      error: {
        type: "invalid_input",
        message: "At most 10 modelIds are allowed."
      }
    });
  });
});
