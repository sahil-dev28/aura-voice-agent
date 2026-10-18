import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    GEMINI_API_KEY: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(4000),
    GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
    GEMINI_SUMMARY_MODEL: z.string().min(1).default("gemini-3-flash-preview"),
    GEMINI_VOICE: z.string().min(1).default("Kore"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
