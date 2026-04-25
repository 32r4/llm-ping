import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { AppError } from "../errors";

export const sendAppError = (c: Context, error: unknown, scope: "models" | "invoke" | "probe_models") => {
  if (error instanceof ZodError) {
    return c.json(
      {
        ok: false,
        scope,
        error: {
          type: "invalid_input",
          message: error.issues[0]?.message ?? "Invalid request payload."
        }
      },
      400
    );
  }

  if (error instanceof AppError) {
    return c.newResponse(
      JSON.stringify({
        ok: false,
        scope,
        error: {
          type: error.type,
          message: error.message
        }
      }),
      error.statusCode as StatusCode,
      {
        "content-type": "application/json; charset=utf-8"
      }
    );
  }

  console.error("Unhandled route error", { scope, error });

  return c.json(
    {
      ok: false,
      scope,
      error: {
        type: "unknown_error",
        message: "Unexpected request failure."
      }
    },
    500
  );
};
