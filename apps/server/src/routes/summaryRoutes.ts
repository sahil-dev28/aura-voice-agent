import { Router } from "express";

import { createSummary } from "@/controller/summaryController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";
import { validateData } from "@/middleware/validationMiddleware";
import { summaryRequestSchema } from "@/schema/summary";

export const summaryRouter: Router = Router();

summaryRouter
  .route("/")
  .post(rateLimit({ max: 10, windowMs: 10 * 60_000 }), validateData(summaryRequestSchema), createSummary);
