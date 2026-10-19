import { Router } from "express";

import { checkOrderAction, confirmOrderAction, escalateToHuman, getOrderDetails, unknownTool } from "@/controller/toolController";
import { rateLimit } from "@/middleware/rateLimitMiddleware";
import { validateData } from "@/middleware/validationMiddleware";
import { checkOrderActionSchema, escalateToHumanSchema, getOrderDetailsSchema } from "@/schema/tool";

export const toolRouter: Router = Router();

toolRouter.use(rateLimit({ max: 120, windowMs: 10 * 60_000 }));

toolRouter.route("/get_order_details").post(validateData(getOrderDetailsSchema), getOrderDetails);
toolRouter.route("/check_order_action").post(validateData(checkOrderActionSchema), checkOrderAction);
toolRouter.route("/confirm_order_action").post(validateData(checkOrderActionSchema), confirmOrderAction);
toolRouter.route("/escalate_to_human").post(validateData(escalateToHumanSchema), escalateToHuman);
toolRouter.route("/:name").post(unknownTool);
