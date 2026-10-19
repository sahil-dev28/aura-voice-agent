import { Router } from "express";

import { uploadReplacementPhoto } from "@/controller/replacementController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";
import { validateData } from "@/middleware/validationMiddleware";
import { photoUploadSchema } from "@/schema/replacement";

export const replacementRouter: Router = Router();

replacementRouter
  .route("/:referenceId/photos")
  .post(rateLimit({ max: 20, windowMs: 10 * 60_000 }), validateData(photoUploadSchema), uploadReplacementPhoto);
