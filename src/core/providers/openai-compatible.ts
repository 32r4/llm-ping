import { AppError } from "../errors";
import { fetchTextWithTiming } from "../http/fetch-json";
import { classifyHttpError } from "../probe/classify-error";
import { previewText } from "../probe/sanitize";
import type {
  ApiMode,
  ChatMessage,
  ErrorPayload,
  InvokeResponsePayload,
  ModelSummary,
  ModelsResponsePayload,
  ProbeModelResult,
  ProbeModelsResponsePayload,
  TimingPayload
} from "../types";

type AdapterFetchOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

type AdapterInvokeOptions = AdapterFetchOptions & {
  apiMode: ApiMode;
  model: string;
  messages: ChatMessage[];
};

type AdapterProbeOptions = AdapterFetchOptions & {
  apiMode: ApiMode;
  modelIds: string[];
  messages: ChatMessage[];
};

type ModelsEnvelope = {
  data?: Array<{
    id?: string;
    owned_by?: string;
  }>;
};

type ResponsesEnvelope = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type ChatCompletionsEnvelope = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const buildRequestId = () => crypto.randomUUID().slice(0, 8);

const jsonHeaders = (apiKey: string) => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json"
});

const parseJson = <T>(text: string, errorMessage: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("not_openai_compatible", errorMessage, 502);
  }
};

const safeParseJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeBaseUrl = (baseUrl: string) => {
  const parsed = new URL(baseUrl);
  const cleanedPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");

  parsed.pathname = cleanedPath || "";
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/+$/, "");
};

const parseModels = (text: string): ModelSummary[] => {
  const payload = parseJson<ModelsEnvelope>(text, "Upstream models response is not valid JSON.");
  const models = Array.isArray(payload.data) ? payload.data : [];

  return models
    .filter((item): item is { id: string; owned_by?: string } => typeof item.id === "string" && item.id.length > 0)
    .map((item) => ({
      id: item.id,
      ownedBy: item.owned_by ?? null
    }));
};

const extractOutputText = (text: string): string => {
  try {
    const payload = JSON.parse(text) as ResponsesEnvelope | ChatCompletionsEnvelope;

    if ("output_text" in payload && typeof payload.output_text === "string" && payload.output_text.length > 0) {
      return payload.output_text;
    }

    if ("output" in payload && Array.isArray(payload.output)) {
      const firstText = payload.output
        .flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text" && typeof item.text === "string");

      if (firstText?.text) {
        return firstText.text;
      }
    }

    if ("choices" in payload && Array.isArray(payload.choices)) {
      const firstChoice = payload.choices[0]?.message?.content;
      if (typeof firstChoice === "string" && firstChoice.length > 0) {
        return firstChoice;
      }
    }
  } catch {
    throw new AppError("not_openai_compatible", "Upstream invoke response is not valid JSON.", 502);
  }

  return "Invocation completed, but upstream returned no readable text output.";
};

const pickEndpoint = (normalizedBaseUrl: string) => ({
  modelsUrl: `${normalizedBaseUrl}/v1/models`,
  responsesUrl: `${normalizedBaseUrl}/v1/responses`,
  chatUrl: `${normalizedBaseUrl}/v1/chat/completions`
});

const getInvokeBody = (model: string, messages: ChatMessage[]) => ({
  model,
  input: messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }]
  })),
  max_output_tokens: 64
});

const getChatBody = (model: string, messages: ChatMessage[]) => ({
  model,
  messages,
  max_tokens: 64,
  temperature: 0
});

const getInvokeFallbackMessage = (apiMode: ApiMode) =>
  apiMode === "responses"
    ? "Unable to invoke model via Responses API."
    : "Unable to invoke model via Chat Completions API.";

const buildInvokePayload = ({
  requestId,
  startedAt,
  normalizedBaseUrl,
  provider,
  response,
  text,
  ttfbMs,
  totalMs,
  model,
  warnings = []
}: {
  requestId: string;
  startedAt: string;
  normalizedBaseUrl: string;
  provider: string;
  response: Response;
  text: string;
  ttfbMs: number;
  totalMs: number;
  model: string;
  warnings?: string[];
}): InvokeResponsePayload => {
  const outputText = extractOutputText(text);

  return {
    ok: true,
    requestId,
    target: {
      baseUrl: normalizedBaseUrl,
      provider
    },
    timing: {
      startedAt,
      ttfbMs,
      totalMs
    },
    invoke: {
      ok: true,
      status: response.status,
      model,
      outputText,
      outputPreview: previewText(outputText)
    },
    upstream: {
      status: response.status,
      bodyText: text,
      bodyJson: safeParseJson(text)
    },
    error: null,
    warnings
  };
};

const toErrorPayload = (error: unknown): ErrorPayload => {
  if (error instanceof AppError) {
    return {
      type: error.type,
      message: error.message
    };
  }

  return {
    type: "unknown_error",
    message: "Unexpected request failure."
  };
};

class OpenAICompatibleAdapter {
  readonly provider: string;
  readonly normalizedBaseUrl: string;

  constructor(baseUrl: string) {
    this.normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    this.provider = "openai-compatible";
  }

  async fetchModels({ apiKey, fetchImpl }: AdapterFetchOptions): Promise<ModelsResponsePayload> {
    const requestId = buildRequestId();
    const startedAt = new Date().toISOString();
    const { modelsUrl } = pickEndpoint(this.normalizedBaseUrl);
    const result = await fetchTextWithTiming({
      url: modelsUrl,
      fetchImpl,
      init: {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`
        }
      }
    });

    if (!result.response.ok) {
      throw classifyHttpError(result.response.status, "Unable to fetch models from upstream.", "models");
    }

    const models = parseModels(result.text);
    if (models.length === 0) {
      throw new AppError("not_openai_compatible", "Upstream returned an empty or unreadable models list.", 502);
    }

    return {
      ok: true,
      requestId,
      target: {
        baseUrl: this.normalizedBaseUrl,
        provider: this.provider
      },
      timing: {
        startedAt,
        ttfbMs: result.ttfbMs,
        totalMs: result.totalMs
      },
      models,
      upstream: {
        status: result.response.status,
        bodyText: result.text,
        bodyJson: safeParseJson(result.text)
      },
      error: null,
      warnings: []
    };
  }

  private async executeInvokeRequest({
    apiKey,
    apiMode,
    model,
    messages,
    fetchImpl
  }: AdapterInvokeOptions): Promise<{
    startedAt: string;
    response: Response;
    text: string;
    ttfbMs: number;
    totalMs: number;
  }> {
    const startedAt = new Date().toISOString();
    const { responsesUrl, chatUrl } = pickEndpoint(this.normalizedBaseUrl);

    if (apiMode === "responses") {
      const responseAttempt = await fetchTextWithTiming({
        url: responsesUrl,
        fetchImpl,
        init: {
          method: "POST",
          headers: jsonHeaders(apiKey),
          body: JSON.stringify(getInvokeBody(model, messages))
        }
      });

      return {
        startedAt,
        response: responseAttempt.response,
        text: responseAttempt.text,
        ttfbMs: responseAttempt.ttfbMs,
        totalMs: responseAttempt.totalMs
      };
    }

    const chatAttempt = await fetchTextWithTiming({
      url: chatUrl,
      fetchImpl,
      init: {
        method: "POST",
        headers: jsonHeaders(apiKey),
        body: JSON.stringify(getChatBody(model, messages))
      }
    });

    return {
      startedAt,
      response: chatAttempt.response,
      text: chatAttempt.text,
      ttfbMs: chatAttempt.ttfbMs,
      totalMs: chatAttempt.totalMs
    };
  }

  async invokeModel({ apiKey, apiMode, model, messages, fetchImpl }: AdapterInvokeOptions): Promise<InvokeResponsePayload> {
    const requestId = buildRequestId();
    const attempt = await this.executeInvokeRequest({
      apiKey,
      apiMode,
      model,
      messages,
      fetchImpl
    });

    if (!attempt.response.ok) {
      throw classifyHttpError(attempt.response.status, getInvokeFallbackMessage(apiMode), "invoke");
    }

    return buildInvokePayload({
      requestId,
      startedAt: attempt.startedAt,
      normalizedBaseUrl: this.normalizedBaseUrl,
      provider: this.provider,
      response: attempt.response,
      text: attempt.text,
      ttfbMs: attempt.ttfbMs,
      totalMs: attempt.totalMs,
      model
    });
  }

  async probeModels({ apiKey, apiMode, modelIds, messages, fetchImpl }: AdapterProbeOptions): Promise<ProbeModelsResponsePayload> {
    const requestId = buildRequestId();
    const startedAt = new Date().toISOString();
    const overallStartedMs = Date.now();
    const results: ProbeModelResult[] = [];

    for (const model of modelIds) {
      const modelStartedAt = new Date().toISOString();
      const modelStartedMs = Date.now();

      try {
        const attempt = await this.executeInvokeRequest({
          apiKey,
          apiMode,
          model,
          messages,
          fetchImpl
        });
        const timing: TimingPayload = {
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
            error: toErrorPayload(classifiedError)
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
            outputPreview: previewText(outputText),
            error: null
          });
        } catch (error) {
          results.push({
            model,
            ok: false,
            status: attempt.response.status,
            timing,
            outputPreview: null,
            error: toErrorPayload(error)
          });
        }
      } catch (error) {
        if (error instanceof AppError && error.type === "auth_failed") {
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
          error: toErrorPayload(error)
        });
      }
    }

    const successCount = results.filter((item) => item.ok).length;

    return {
      ok: true,
      requestId,
      target: {
        baseUrl: this.normalizedBaseUrl,
        provider: this.provider
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
      warnings: []
    };
  }
}

export const createOpenAICompatibleAdapter = (baseUrl: string) => new OpenAICompatibleAdapter(baseUrl);
