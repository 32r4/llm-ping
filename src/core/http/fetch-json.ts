import { AppError } from "../errors";

type FetchJsonOptions = {
  url: string;
  init: RequestInit;
  timeoutMs?: number;
  maxChars?: number;
  fetchImpl?: typeof fetch;
};

type FetchJsonResult = {
  response: Response;
  text: string;
  ttfbMs: number;
  totalMs: number;
};

const createTooLargeError = () =>
  new AppError("response_too_large", "Upstream response is too large to process safely.", 413);

const readResponseText = async (response: Response, maxChars: number) => {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxChars) {
    throw createTooLargeError();
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      text += decoder.decode(value, { stream: true });
      if (text.length > maxChars) {
        try {
          await reader.cancel("response_too_large");
        } catch {
          // Ignore cancellation failures; the size violation is the actionable error.
        }

        throw createTooLargeError();
      }
    }

    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  if (text.length > maxChars) {
    throw createTooLargeError();
  }

  return text;
};

export const fetchTextWithTiming = async ({
  url,
  init,
  timeoutMs = 12_000,
  maxChars = 512_000,
  fetchImpl = fetch
}: FetchJsonOptions): Promise<FetchJsonResult> => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
    const ttfbMs = Date.now() - startedAt;
    const text = await readResponseText(response, maxChars);
    const totalMs = Date.now() - startedAt;

    return {
      response,
      text,
      ttfbMs,
      totalMs
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("timeout", "Upstream request timed out.", 504);
    }

    throw new AppError("network_error", "Unable to reach upstream service.", 502, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  } finally {
    clearTimeout(timeout);
  }
};
