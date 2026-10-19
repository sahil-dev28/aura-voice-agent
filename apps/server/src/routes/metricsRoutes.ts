import { Router } from "express";

import { recordMetrics } from "@/controller/metricsController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";
import { validateData } from "@/middleware/validationMiddleware";
import { callMetricsSchema } from "@/schema/metrics";

export const metricsRouter: Router = Router();

metricsRouter.route("/").post(rateLimit({ max: 10, windowMs: 10 * 60_000 }), validateData(callMetricsSchema), recordMetrics);
