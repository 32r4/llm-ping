import type { Context } from "hono";

import { sendAppError } from "../core/http/error-response";
import { createOpenAICompatibleAdapter } from "../core/providers/openai-compatible";
import { type InvokeRequest, invokeRequestSchema } from "../core/schemas/invoke";
import { applyRequestGuard } from "../core/security/request-guard";
import { parseJsonBody } from "../core/validation/parse-body";
import { validateBaseUrl } from "../core/validation/validate-base-url";

export const handleInvoke = async (c: Context) => {
  try {
    applyRequestGuard(c.req.raw);
    const payload = await parseJsonBody<InvokeRequest>(c.req.raw, invokeRequestSchema);
    validateBaseUrl(payload.baseUrl);

    const adapter = createOpenAICompatibleAdapter(payload.baseUrl);
    const result = await adapter.invokeModel({
      apiKey: payload.apiKey,
      apiMode: payload.apiMode,
      model: payload.model,
      messages: payload.messages,
      fetchImpl: fetch
    });

    return c.json(result);
  } catch (error) {
    return sendAppError(c, error, "invoke");
  }
};
