import { z } from "zod";

export const modelsRequestSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey is required."),
  baseUrl: z.string().trim().min(1, "baseUrl is required.")
});

export type ModelsRequest = z.infer<typeof modelsRequestSchema>;
