import { describe, expect, it } from "vitest";

import { AppError } from "../src/core/errors";
import { consumeRateLimit } from "../src/core/security/rate-limit";

describe("consumeRateLimit", () => {
  it("allows twenty requests and blocks the next one inside the same window", () => {
    const now = 1_000;
    for (let index = 0; index < 20; index += 1) {
      expect(() => consumeRateLimit("vitest-ok", now + index)).not.toThrow();
    }

    expect(() => consumeRateLimit("vitest-ok", now + 21)).toThrowError(AppError);
  });
});
