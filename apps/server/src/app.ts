import cors from "cors";
import express, { type Express } from "express";

import { env } from "@aura/env/server";

export const app: Express = express();

app.set("trust proxy", 1);
app.use(cors({ origin: env.CORS_ORIGIN, methods: ["GET", "POST"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ data: { ok: true } });
});

if (env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

export default app;
