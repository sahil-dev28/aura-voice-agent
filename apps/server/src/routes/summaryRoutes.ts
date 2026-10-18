import { Router } from "express";

import { createSummary } from "@/controller/summaryController";
import { validateData } from "@/middleware/validationMiddleware";
import { summaryRequestSchema } from "@/schema/summary";

export const summaryRouter: Router = Router();

summaryRouter.route("/").post(validateData(summaryRequestSchema), createSummary);
