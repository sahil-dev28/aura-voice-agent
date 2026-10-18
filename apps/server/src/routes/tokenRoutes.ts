import { Router } from "express";

import { createToken } from "@/controller/tokenController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";

export const tokenRouter: Router = Router();

tokenRouter.route("/").post(rateLimit({ max: 5, windowMs: 10 * 60_000 }), createToken);
