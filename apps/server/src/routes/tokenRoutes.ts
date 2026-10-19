import { Router } from "express";

import { createToken } from "@/controller/tokenController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";
import { validateData } from "@/middleware/validationMiddleware";
import { tokenRequestSchema } from "@/schema/token";

export const tokenRouter: Router = Router();

tokenRouter.route("/").post(rateLimit({ max: 5, windowMs: 10 * 60_000 }), validateData(tokenRequestSchema), createToken);
