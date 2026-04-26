import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTextWithTiming } from "../src/core/http/fetch-json";

const encoder = new TextEncoder();

const makeStream = (chunks: string[], onPull?: () => void) =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();

      const nextChunk = chunks.shift();
      if (nextChunk === undefined) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(nextChunk));
    }
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTextWithTiming", () => {
  it("reads streamed text under the configured limit", async () => {
    const result = await fetchTextWithTiming({
      url: "https://api.example.com/v1/models",
      init: { method: "GET" },
      maxChars: 10,
      fetchImpl: async () =>
        new Response(makeStream(["he", "llo"]), {
          status: 200,
          headers: { "content-type": "text/plain" }
        })
    });

    expect(result.text).toBe("hello");
    expect(result.response.status).toBe(200);
    expect(result.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(result.totalMs).toBeGreaterThanOrEqual(result.ttfbMs);
  });

  it("rejects streamed text once the response exceeds the configured limit", async () => {
    await expect(
      fetchTextWithTiming({
        url: "https://api.example.com/v1/models",
        init: { method: "GET" },
        maxChars: 4,
        fetchImpl: async () =>
          new Response(makeStream(["ping", "pong"]), {
            status: 200,
            headers: { "content-type": "text/plain" }
          })
      })
    ).rejects.toMatchObject({
      type: "response_too_large",
      statusCode: 413
    });
  });

  it("rejects oversized content-length headers before reading the stream", async () => {
    const response = new Response(makeStream(["hello"]), {
      status: 200,
      headers: {
        "content-length": "10",
        "content-type": "text/plain"
      }
    });
    const body = response.body;
    let readerRequests = 0;

    if (!body) {
      throw new Error("Expected response body to be present.");
    }

    const originalGetReader = body.getReader.bind(body);
    Object.defineProperty(body, "getReader", {
      value(...args: Parameters<typeof body.getReader>) {
        readerRequests += 1;
        return originalGetReader(...args);
      }
    });

    await expect(
      fetchTextWithTiming({
        url: "https://api.example.com/v1/models",
        init: { method: "GET" },
        maxChars: 3,
        fetchImpl: async () => response
      })
    ).rejects.toMatchObject({
      type: "response_too_large",
      statusCode: 413
    });

    expect(readerRequests).toBe(0);
  });

  it("uses monotonic timing values when performance.now is available", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100.25)
      .mockReturnValueOnce(101.5)
      .mockReturnValueOnce(102.75);

    const result = await fetchTextWithTiming({
      url: "https://api.example.com/v1/models",
      init: { method: "GET" },
      fetchImpl: async () =>
        new Response(makeStream(["ok"]), {
          status: 200,
          headers: { "content-type": "text/plain" }
        })
    });

    expect(result.ttfbMs).toBeCloseTo(1.25, 5);
    expect(result.totalMs).toBeCloseTo(2.5, 5);
  });
});
