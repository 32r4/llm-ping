import { Hono } from "hono";
import { cors } from "hono/cors";

import { handleHealth } from "./routes/health";
import { handleInvoke } from "./routes/invoke";
import { handleModels } from "./routes/models";
import { handleProbeModels } from "./routes/probe-models";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "OPTIONS"]
  })
);

app.get("/health", handleHealth);
app.post("/api/models", handleModels);
app.post("/api/invoke", handleInvoke);
app.post("/api/probe-models", handleProbeModels);

app.notFound((c) =>
  c.json(
    {
      ok: false,
      error: {
        type: "not_found",
        message: "Route not found."
      }
    },
    404
  )
);

app.onError((error, c) => {
  console.error("Unhandled error", {
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 3).join("\n")
  });

  return c.json(
    {
      ok: false,
      error: {
        type: "unknown_error",
        message: "Unexpected server error."
      }
    },
    500
  );
});

export default app;
