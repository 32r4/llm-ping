import { z } from "zod";

export const invokeRequestSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey is required."),
  baseUrl: z.string().trim().min(1, "baseUrl is required."),
  apiMode: z.enum(["responses", "chat_completions"]).default("responses"),
  model: z.string().trim().min(1, "model is required."),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().trim().min(1, "message content is required.")
      })
    )
    .min(1, "At least one message is required.")
});

export type InvokeRequest = z.infer<typeof invokeRequestSchema>;
