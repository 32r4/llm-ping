import { describe, expect, it } from "vitest";

import { createOpenAICompatibleAdapter } from "../src/core/providers/openai-compatible";

const makeJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("OpenAICompatibleAdapter", () => {
  it("parses a non-empty models list", async () => {
    const adapter = createOpenAICompatibleAdapter("https://api.example.com");
    const response = await adapter.fetchModels({
      apiKey: "sk-test",
      fetchImpl: async () =>
        makeJsonResponse({
          data: [
            { id: "gpt-4o-mini", owned_by: "openai" },
            { id: "gpt-4.1-mini", owned_by: "openai" }
          ]
        })
    });

    expect(response.ok).toBe(true);
    expect(response.models.map((item) => item.id)).toEqual(["gpt-4o-mini", "gpt-4.1-mini"]);
    expect(response.upstream.bodyJson).not.toBeNull();
  });

  it("invokes both supported upstream APIs", async () => {
    const adapter = createOpenAICompatibleAdapter("https://api.example.com");
    const chatResponse = await adapter.invokeModel({
      apiKey: "sk-test",
      apiMode: "chat_completions",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      fetchImpl: async (input) => {
        const url = String(input);
        expect(url.endsWith("/v1/chat/completions")).toBe(true);
        return makeJsonResponse({
          choices: [
            {
              message: {
                content: "pong"
              }
            }
          ]
        });
      }
    });

    const responsesResponse = await adapter.invokeModel({
      apiKey: "sk-test",
      apiMode: "responses",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      fetchImpl: async (input) => {
        const url = String(input);
        expect(url.endsWith("/v1/responses")).toBe(true);

        return makeJsonResponse({
          output_text: "pong"
        });
      }
    });

    expect(chatResponse.ok).toBe(true);
    expect(chatResponse.invoke.outputText).toBe("pong");
    expect(chatResponse.warnings).toEqual([]);
    expect(chatResponse.upstream.bodyJson).not.toBeNull();
    expect(responsesResponse.ok).toBe(true);
    expect(responsesResponse.invoke.outputText).toBe("pong");
    expect(responsesResponse.warnings).toEqual([]);
    expect(responsesResponse.upstream.bodyJson).not.toBeNull();
  });

  it("keeps non-auth probe failures inside per-model results", async () => {
    const adapter = createOpenAICompatibleAdapter("https://api.example.com");
    let callCount = 0;

    const response = await adapter.probeModels({
      apiKey: "sk-test",
      apiMode: "chat_completions",
      modelIds: ["alpha", "beta", "gamma"],
      messages: [{ role: "user", content: "ping" }],
      fetchImpl: async (input) => {
        const url = String(input);
        expect(url.endsWith("/v1/chat/completions")).toBe(true);
        callCount += 1;

        if (callCount === 1) {
          return makeJsonResponse(
            {
              error: {
                message: "forbidden"
              }
            },
            403
          );
        }

        if (callCount === 2) {
          return makeJsonResponse({
            choices: [
              {
                message: {
                  content: "pong-two"
                }
              }
            ]
          });
        }

        return makeJsonResponse(
          {
            error: {
              message: "not found"
            }
          },
          404
        );
      }
    });

    expect(response.ok).toBe(true);
    expect(response.summary).toEqual({
      total: 3,
      success: 1,
      failed: 2
    });
    expect(response.results).toMatchObject([
      {
        model: "alpha",
        ok: false,
        status: 403,
        outputPreview: null,
        error: {
          type: "permission_denied",
          message: "API key does not have permission for this operation."
        }
      },
      {
        model: "beta",
        ok: true,
        status: 200,
        outputPreview: "pong-two",
        error: null
      },
      {
        model: "gamma",
        ok: false,
        status: 404,
        outputPreview: null,
        error: {
          type: "model_unavailable",
          message: "Selected model is not available for invocation."
        }
      }
    ]);
  });
});
