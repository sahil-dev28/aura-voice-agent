import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { env } from "@aura/env/server";

import { metricsRouter } from "@/routes/metricsRoutes";
import { orderRouter } from "@/routes/orderRoutes";
import { replacementRouter } from "@/routes/replacementRoutes";
import { summaryRouter } from "@/routes/summaryRoutes";
import { tokenRouter } from "@/routes/tokenRoutes";
import { toolRouter } from "@/routes/toolRoutes";
import { formatUnknownError } from "@/utils/formatUnknownError";

export const app: Express = express();

app.set("trust proxy", 1);
app.use(cors({ origin: env.CORS_ORIGIN, methods: ["GET", "POST"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ data: { ok: true } });
});

app.use("/api/token", tokenRouter);
app.use("/api/orders", orderRouter);
app.use("/api/tools", toolRouter);
app.use("/api/summary", summaryRouter);
app.use("/api/replacements", replacementRouter);
app.use("/api/metrics", metricsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }
  const status = (error as { status?: number }).status ?? 500;
  if (status >= 500) console.error("Unhandled request error:", error);
  res.status(status).json({ error: status >= 500 ? "Something went wrong" : formatUnknownError(error).error });
});

if (env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

export default app;
