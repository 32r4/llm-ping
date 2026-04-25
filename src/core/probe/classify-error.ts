import { AppError } from "../errors";

export const classifyHttpError = (
  status: number,
  fallbackMessage: string,
  scope: "models" | "invoke"
) => {
  if (status === 401) {
    return new AppError("auth_failed", "API key is invalid or missing.", 401);
  }

  if (status === 403) {
    return new AppError("permission_denied", "API key does not have permission for this operation.", 403);
  }

  if (status === 404) {
    return new AppError(
      scope === "models" ? "not_openai_compatible" : "model_unavailable",
      scope === "models"
        ? "Upstream endpoint does not look like an OpenAI-compatible models API."
        : "Selected model is not available for invocation.",
      404
    );
  }

  if (status >= 500) {
    return new AppError("upstream_5xx", "Upstream service returned a server error.", 502);
  }

  return new AppError("unknown_error", fallbackMessage, 502);
};
