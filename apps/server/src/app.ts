import cors from "cors";
import express, { type Express } from "express";

import { env } from "@aura/env/server";

import { metricsRouter } from "@/routes/metricsRoutes";
import { orderRouter } from "@/routes/orderRoutes";
import { replacementRouter } from "@/routes/replacementRoutes";
import { summaryRouter } from "@/routes/summaryRoutes";
import { tokenRouter } from "@/routes/tokenRoutes";
import { toolRouter } from "@/routes/toolRoutes";

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

if (env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

export default app;
