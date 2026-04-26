const runtimeMode = window.location.protocol === "file:" ? "browser-direct" : "worker-proxy";

const buildRequestId = () => {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(16).slice(2, 10);
  }
};

const getRuntimeWarnings = () =>
  runtimeMode === "browser-direct"
    ? ["Local HTML mode sends requests directly from the browser and requires upstream CORS support."]
    : [];

const createRequestError = (type, message, status = 502, cause = null) => ({
  type,
  message,
  status,
  cause
});

const toPayloadError = (error) => {
  if (error && typeof error === "object" && typeof error.type === "string" && typeof error.message === "string") {
    return {
      type: error.type,
      message: error.message
    };
  }

  if (error instanceof Error && error.message) {
    return {
      type: "unknown_error",
      message: error.message
    };
  }

  return {
    type: "unknown_error",
    message: "Unexpected request failure."
  };
};

const getErrorStatus = (error) =>
  error && typeof error === "object" && Number.isFinite(error.status) ? Number(error.status) : 502;

const getNetworkErrorMessage = () =>
  runtimeMode === "browser-direct"
    ? "Unable to reach upstream service. When using the local HTML file, the upstream API must allow CORS requests."
    : "Unable to reach upstream service.";

const validateDirectBaseUrl = (baseUrl) => {
  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw createRequestError("invalid_base_url", "baseUrl must be a valid URL.", 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw createRequestError("invalid_base_url", "Only http:// or https:// baseUrl values are allowed.", 400);
  }

  if (parsed.username || parsed.password) {
    throw createRequestError("invalid_base_url", "baseUrl must not include embedded credentials.", 400);
  }

  return parsed;
};

const normalizeDirectBaseUrl = (baseUrl) => {
  const parsed = validateDirectBaseUrl(baseUrl);
  const cleanedPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");

  parsed.pathname = cleanedPath || "";
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/+$/, "");
};

const getSafeTargetBaseUrl = (baseUrl) => {
  try {
    return normalizeDirectBaseUrl(baseUrl);
  } catch {
    const trimmed = baseUrl.trim();
    return trimmed || null;
  }
};

const pickEndpointUrls = (normalizedBaseUrl) => ({
  modelsUrl: normalizedBaseUrl + "/v1/models",
  responsesUrl: normalizedBaseUrl + "/v1/responses",
  chatUrl: normalizedBaseUrl + "/v1/chat/completions"
});

const jsonHeaders = (apiKey) => ({
  authorization: "Bearer " + apiKey,
  "content-type": "application/json"
});

const parseJsonText = (text, errorMessage) => {
  try {
    return JSON.parse(text);
  } catch {
    throw createRequestError("not_openai_compatible", errorMessage, 502);
  }
};

const safeParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseModelsText = (text) => {
  const payload = parseJsonText(text, "Upstream models response is not valid JSON.");
  const models = Array.isArray(payload?.data) ? payload.data : [];

  return models
    .filter((item) => typeof item?.id === "string" && item.id.length > 0)
    .map((item) => ({
      id: item.id,
      ownedBy: item.owned_by ?? null
    }));
};

const extractOutputText = (text) => {
  const payload = parseJsonText(text, "Upstream invoke response is not valid JSON.");

  if (typeof payload?.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const firstText = payload.output
      .flatMap((item) => item?.content ?? [])
      .find((item) => item?.type === "output_text" && typeof item.text === "string");

    if (firstText?.text) {
      return firstText.text;
    }
  }

  if (Array.isArray(payload?.choices)) {
    const firstChoice = payload.choices[0]?.message?.content;
    if (typeof firstChoice === "string" && firstChoice.length > 0) {
      return firstChoice;
    }
  }

  return "Invocation completed, but upstream returned no readable text output.";
};

const previewResponseText = (value, maxLength = 240) =>
  value.length <= maxLength ? value : value.slice(0, maxLength - 1) + "...";

const getInvokeBody = (model, messages) => ({
  model,
  input: messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }]
  })),
  max_output_tokens: 64
});

const getChatBody = (model, messages) => ({
  model,
  messages,
  max_tokens: 64,
  temperature: 0
});

const classifyHttpError = (status, fallbackMessage, scope) => {
  if (status === 401) {
    return createRequestError("auth_failed", "API key is invalid or missing.", 401);
  }

  if (status === 403) {
    return createRequestError("permission_denied", "API key does not have permission for this operation.", 403);
  }

  if (status === 404) {
    return createRequestError(
      scope === "models" ? "not_openai_compatible" : "model_unavailable",
      scope === "models"
        ? "Upstream endpoint does not look like an OpenAI-compatible models API."
        : "Selected model is not available for invocation.",
      404
    );
  }

  if (status >= 500) {
    return createRequestError("upstream_5xx", "Upstream service returned a server error.", 502);
  }

  return createRequestError("unknown_error", fallbackMessage, 502);
};

const getInvokeFallbackMessage = (apiMode) =>
  apiMode === "responses"
    ? "Unable to invoke model via Responses API."
    : "Unable to invoke model via Chat Completions API.";

const fetchTextWithTimingDirect = async ({ url, init, timeoutMs = 12_000, maxChars = 512_000 }) => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const ttfbMs = Date.now() - startedAt;
    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > maxChars) {
      throw createRequestError("response_too_large", "Upstream response is too large to process safely.", 413);
    }

    const text = await response.text();
    if (text.length > maxChars) {
      throw createRequestError("response_too_large", "Upstream response is too large to process safely.", 413);
    }

    return {
      response,
      text,
      ttfbMs,
      totalMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error && typeof error === "object" && typeof error.type === "string") {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw createRequestError("timeout", "Upstream request timed out.", 504);
    }

    throw createRequestError(
      "network_error",
      getNetworkErrorMessage(),
      502,
      error instanceof Error ? error.message : "unknown"
    );
  } finally {
    clearTimeout(timeout);
  }
};

const buildTarget = (baseUrl) => ({
  baseUrl: getSafeTargetBaseUrl(baseUrl),
  provider: "openai-compatible"
});

const createModelsFailurePayload = (baseUrl, error) => ({
  ok: false,
  target: buildTarget(baseUrl),
  timing: {
    startedAt: new Date().toISOString(),
    ttfbMs: null,
    totalMs: null
  },
  models: [],
  upstream: null,
  error: toPayloadError(error),
  warnings: getRuntimeWarnings()
});

const createInvokeFailurePayload = (baseUrl, model, error) => ({
  ok: false,
  target: buildTarget(baseUrl),
  timing: {
    startedAt: new Date().toISOString(),
    ttfbMs: null,
    totalMs: null
  },
  invoke: {
    model: model || null,
    status: null,
    outputPreview: null
  },
  upstream: null,
  error: toPayloadError(error),
  warnings: getRuntimeWarnings()
});

const createProbeFailurePayload = (baseUrl, error) => ({
  ok: false,
  target: buildTarget(baseUrl),
  timing: {
    startedAt: new Date().toISOString(),
    ttfbMs: null,
    totalMs: null
  },
  summary: {
    total: 0,
    success: 0,
    failed: 0
  },
  results: [],
  error: toPayloadError(error),
  warnings: getRuntimeWarnings()
});

const requestModelsDirect = async ({ apiKey, baseUrl }) => {
  const requestId = buildRequestId();
  const startedAt = new Date().toISOString();
  const normalizedBaseUrl = normalizeDirectBaseUrl(baseUrl);
  const { modelsUrl } = pickEndpointUrls(normalizedBaseUrl);
  const attempt = await fetchTextWithTimingDirect({
    url: modelsUrl,
    init: {
      method: "GET",
      headers: {
        authorization: "Bearer " + apiKey
      }
    }
  });

  if (!attempt.response.ok) {
    throw classifyHttpError(attempt.response.status, "Unable to fetch models from upstream.", "models");
  }

  const models = parseModelsText(attempt.text);
  if (!models.length) {
    throw createRequestError("not_openai_compatible", "Upstream returned an empty or unreadable models list.", 502);
  }

  return {
    ok: true,
    requestId,
    target: {
      baseUrl: normalizedBaseUrl,
      provider: "openai-compatible"
    },
    timing: {
      startedAt,
      ttfbMs: attempt.ttfbMs,
      totalMs: attempt.totalMs
    },
    models,
    upstream: {
      status: attempt.response.status,
      bodyText: attempt.text,
      bodyJson: safeParseJson(attempt.text)
    },
    error: null,
    warnings: getRuntimeWarnings()
  };
};

const executeDirectInvokeRequest = async ({ apiKey, baseUrl, apiMode, model, messages }) => {
  const startedAt = new Date().toISOString();
  const normalizedBaseUrl = normalizeDirectBaseUrl(baseUrl);
  const { responsesUrl, chatUrl } = pickEndpointUrls(normalizedBaseUrl);
  const url = apiMode === "responses" ? responsesUrl : chatUrl;
  const body =
    apiMode === "responses"
      ? JSON.stringify(getInvokeBody(model, messages))
      : JSON.stringify(getChatBody(model, messages));
  const attempt = await fetchTextWithTimingDirect({
    url,
    init: {
      method: "POST",
      headers: jsonHeaders(apiKey),
      body
    }
  });

  return {
    startedAt,
    normalizedBaseUrl,
    response: attempt.response,
    text: attempt.text,
    ttfbMs: attempt.ttfbMs,
    totalMs: attempt.totalMs
  };
};

const requestInvokeDirect = async ({ apiKey, baseUrl, apiMode, model, messages }) => {
  const requestId = buildRequestId();
  const attempt = await executeDirectInvokeRequest({
    apiKey,
    baseUrl,
    apiMode,
    model,
    messages
  });

  if (!attempt.response.ok) {
    throw classifyHttpError(attempt.response.status, getInvokeFallbackMessage(apiMode), "invoke");
  }

  const outputText = extractOutputText(attempt.text);

  return {
    ok: true,
    requestId,
    target: {
      baseUrl: attempt.normalizedBaseUrl,
      provider: "openai-compatible"
    },
    timing: {
      startedAt: attempt.startedAt,
      ttfbMs: attempt.ttfbMs,
      totalMs: attempt.totalMs
    },
    invoke: {
      ok: true,
      status: attempt.response.status,
      model,
      outputText,
      outputPreview: previewResponseText(outputText)
    },
    upstream: {
      status: attempt.response.status,
      bodyText: attempt.text,
      bodyJson: safeParseJson(attempt.text)
    },
    error: null,
    warnings: getRuntimeWarnings()
  };
};

const requestProbeModelsDirect = async ({ apiKey, baseUrl, apiMode, modelIds, messages }) => {
  const requestId = buildRequestId();
  const startedAt = new Date().toISOString();
  const overallStartedMs = Date.now();
  const normalizedBaseUrl = normalizeDirectBaseUrl(baseUrl);
  const results = [];

  for (const model of modelIds) {
    const modelStartedAt = new Date().toISOString();
    const modelStartedMs = Date.now();

    try {
      const attempt = await executeDirectInvokeRequest({
        apiKey,
        baseUrl: normalizedBaseUrl,
        apiMode,
        model,
        messages
      });
      const timing = {
        startedAt: attempt.startedAt,
        ttfbMs: attempt.ttfbMs,
        totalMs: attempt.totalMs
      };

      if (!attempt.response.ok) {
        const classifiedError = classifyHttpError(attempt.response.status, getInvokeFallbackMessage(apiMode), "invoke");

        if (classifiedError.type === "auth_failed") {
          throw classifiedError;
        }

        results.push({
          model,
          ok: false,
          status: attempt.response.status,
          timing,
          outputPreview: null,
          error: toPayloadError(classifiedError)
        });
        continue;
      }

      try {
        const outputText = extractOutputText(attempt.text);
        results.push({
          model,
          ok: true,
          status: attempt.response.status,
          timing,
          outputPreview: previewResponseText(outputText),
          error: null
        });
      } catch (error) {
        results.push({
          model,
          ok: false,
          status: attempt.response.status,
          timing,
          outputPreview: null,
          error: toPayloadError(error)
        });
      }
    } catch (error) {
      if (error && typeof error === "object" && error.type === "auth_failed") {
        throw error;
      }

      results.push({
        model,
        ok: false,
        status: null,
        timing: {
          startedAt: modelStartedAt,
          ttfbMs: null,
          totalMs: Date.now() - modelStartedMs
        },
        outputPreview: null,
        error: toPayloadError(error)
      });
    }
  }

  const successCount = results.filter((item) => item.ok).length;

  return {
    ok: true,
    requestId,
    target: {
      baseUrl: normalizedBaseUrl,
      provider: "openai-compatible"
    },
    timing: {
      startedAt,
      ttfbMs: null,
      totalMs: Date.now() - overallStartedMs
    },
    summary: {
      total: results.length,
      success: successCount,
      failed: results.length - successCount
    },
    results,
    error: null,
    warnings: getRuntimeWarnings()
  };
};

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
};

export const sendModelsRequest = async ({ apiKey, baseUrl }) => {
  if (runtimeMode !== "browser-direct") {
    return postJson("/api/models", {
      apiKey,
      baseUrl
    });
  }

  try {
    const payload = await requestModelsDirect({
      apiKey,
      baseUrl
    });

    return {
      ok: true,
      status: 200,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: getErrorStatus(error),
      payload: createModelsFailurePayload(baseUrl, error)
    };
  }
};

export const sendInvokeRequest = async ({ apiKey, baseUrl, apiMode, model, messages }) => {
  if (runtimeMode !== "browser-direct") {
    return postJson("/api/invoke", {
      apiKey,
      baseUrl,
      apiMode,
      model,
      messages
    });
  }

  try {
    const payload = await requestInvokeDirect({
      apiKey,
      baseUrl,
      apiMode,
      model,
      messages
    });

    return {
      ok: true,
      status: 200,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: getErrorStatus(error),
      payload: createInvokeFailurePayload(baseUrl, model, error)
    };
  }
};

export const sendProbeRequest = async ({ apiKey, baseUrl, apiMode, modelIds, messages }) => {
  if (runtimeMode !== "browser-direct") {
    return postJson("/api/probe-models", {
      apiKey,
      baseUrl,
      apiMode,
      modelIds,
      messages
    });
  }

  try {
    const payload = await requestProbeModelsDirect({
      apiKey,
      baseUrl,
      apiMode,
      modelIds,
      messages
    });

    return {
      ok: true,
      status: 200,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: getErrorStatus(error),
      payload: createProbeFailurePayload(baseUrl, error)
    };
  }
};
