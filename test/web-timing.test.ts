import { describe, expect, it } from "vitest";

import { ensureCompletedTiming, formatDurationMs } from "../src/web/timing";

describe("web timing helpers", () => {
  it("formats durations with two decimal places", () => {
    expect(formatDurationMs(null)).toBe("--");
    expect(formatDurationMs(12)).toBe("12.00 ms");
    expect(formatDurationMs(12.345)).toBe("12.35 ms");
  });

  it("backfills failed timing when startedAt is zero", () => {
    const payload = {
      ok: false,
      timing: {
        startedAt: "2026-04-26T00:00:00.000Z",
        ttfbMs: null,
        totalMs: null
      }
    };

    const result = ensureCompletedTiming(payload, 0, () => 12.345);

    expect(result).toEqual({
      ok: false,
      timing: {
        startedAt: "2026-04-26T00:00:00.000Z",
        ttfbMs: null,
        totalMs: 12.345
      }
    });
  });
});
