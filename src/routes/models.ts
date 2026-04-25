import type { Context } from "hono";

import { sendAppError } from "../core/http/error-response";
import { createOpenAICompatibleAdapter } from "../core/providers/openai-compatible";
import { type ModelsRequest, modelsRequestSchema } from "../core/schemas/models";
import { applyRequestGuard } from "../core/security/request-guard";
import { parseJsonBody } from "../core/validation/parse-body";
import { validateBaseUrl } from "../core/validation/validate-base-url";

export const handleModels = async (c: Context) => {
  try {
    applyRequestGuard(c.req.raw);
    const payload = await parseJsonBody<ModelsRequest>(c.req.raw, modelsRequestSchema);
    validateBaseUrl(payload.baseUrl);

    const adapter = createOpenAICompatibleAdapter(payload.baseUrl);
    const result = await adapter.fetchModels({
      apiKey: payload.apiKey,
      fetchImpl: fetch
    });

    return c.json(result);
  } catch (error) {
    return sendAppError(c, error, "models");
  }
};
