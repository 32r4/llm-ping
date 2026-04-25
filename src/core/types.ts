export type ApiMode = "responses" | "chat_completions";

export type AppErrorType =
  | "invalid_input"
  | "invalid_base_url"
  | "network_error"
  | "timeout"
  | "auth_failed"
  | "permission_denied"
  | "not_openai_compatible"
  | "model_unavailable"
  | "upstream_5xx"
  | "response_too_large"
  | "not_found"
  | "unknown_error";

export type ErrorPayload = {
  type: AppErrorType;
  message: string;
};

export type TargetPayload = {
  baseUrl: string;
  provider: string;
};

export type TimingPayload = {
  startedAt: string;
  ttfbMs: number | null;
  totalMs: number | null;
};

export type ModelSummary = {
  id: string;
  ownedBy: string | null;
};

export type UpstreamPayload = {
  status: number;
  bodyText: string;
  bodyJson: unknown | null;
};

export type ModelsResponsePayload = {
  ok: boolean;
  requestId: string;
  target: TargetPayload;
  timing: TimingPayload;
  models: ModelSummary[];
  upstream: UpstreamPayload;
  error: ErrorPayload | null;
  warnings: string[];
};

export type InvokeResponsePayload = {
  ok: boolean;
  requestId: string;
  target: TargetPayload;
  timing: TimingPayload;
  invoke: {
    ok: boolean;
    status: number;
    model: string;
    outputText: string;
    outputPreview: string;
  };
  upstream: UpstreamPayload;
  error: ErrorPayload | null;
  warnings: string[];
};

export type ProbeModelResult = {
  model: string;
  ok: boolean;
  status: number | null;
  timing: TimingPayload;
  outputPreview: string | null;
  error: ErrorPayload | null;
};

export type ProbeModelsResponsePayload = {
  ok: boolean;
  requestId: string;
  target: TargetPayload;
  timing: TimingPayload;
  summary: {
    total: number;
    success: number;
    failed: number;
  };
  results: ProbeModelResult[];
  error: ErrorPayload | null;
  warnings: string[];
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
