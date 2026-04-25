import { ZodType } from "zod";

import { AppError } from "../errors";

export const parseJsonBody = async <T>(request: Request, schema: ZodType<T>): Promise<T> => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new AppError("invalid_input", "Request body must be valid JSON.", 400);
  }

  return schema.parse(payload);
};
