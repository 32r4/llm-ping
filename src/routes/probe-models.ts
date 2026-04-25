import type { Context } from "hono";

import { sendAppError } from "../core/http/error-response";
import { createOpenAICompatibleAdapter } from "../core/providers/openai-compatible";
import { type ProbeModelsRequest, probeModelsRequestSchema } from "../core/schemas/probe-models";
import { applyRequestGuard } from "../core/security/request-guard";
import { parseJsonBody } from "../core/validation/parse-body";
import { validateBaseUrl } from "../core/validation/validate-base-url";

export const handleProbeModels = async (c: Context) => {
  try {
    applyRequestGuard(c.req.raw);
    const payload = await parseJsonBody<ProbeModelsRequest>(c.req.raw, probeModelsRequestSchema);
    validateBaseUrl(payload.baseUrl);

    const adapter = createOpenAICompatibleAdapter(payload.baseUrl);
    const result = await adapter.probeModels({
      apiKey: payload.apiKey,
      apiMode: payload.apiMode,
      modelIds: payload.modelIds,
      messages: payload.messages,
      fetchImpl: fetch
    });

    return c.json(result);
  } catch (error) {
    return sendAppError(c, error, "probe_models");
  }
};
