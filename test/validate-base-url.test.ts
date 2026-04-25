import { describe, expect, it } from "vitest";

import { AppError } from "../src/core/errors";
import { validateBaseUrl } from "../src/core/validation/validate-base-url";

describe("validateBaseUrl", () => {
  it("accepts public https urls", () => {
    expect(validateBaseUrl("https://api.openai.com").hostname).toBe("api.openai.com");
  });

  it("rejects non-public or malformed targets", () => {
    const blockedUrls = [
      "http://api.openai.com",
      "https://user:pass@api.openai.com",
      "https://localhost:3000",
      "https://192.168.1.20",
      "https://[::1]",
      "https://[fe80::1]",
      "https://[fc00::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:192.168.1.10]"
    ];

    for (const url of blockedUrls) {
      expect(() => validateBaseUrl(url), url).toThrowError(AppError);
    }
  });
});
