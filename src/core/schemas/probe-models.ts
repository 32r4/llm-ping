import { z } from "zod";

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().trim().min(1, "message content is required.")
});

export const probeModelsRequestSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey is required."),
  baseUrl: z.string().trim().min(1, "baseUrl is required."),
  apiMode: z.enum(["responses", "chat_completions"]).default("responses"),
  modelIds: z
    .array(z.string().trim().min(1, "modelId is required."))
    .min(1, "At least one modelId is required.")
    .max(10, "At most 10 modelIds are allowed."),
  messages: z.array(chatMessageSchema).min(1, "At least one message is required.")
});

export type ProbeModelsRequest = z.infer<typeof probeModelsRequestSchema>;
