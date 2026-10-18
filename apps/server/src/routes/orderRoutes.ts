import { Router } from "express";

import { getOrders } from "@/controller/toolController";

export const orderRouter: Router = Router();

orderRouter.route("/").get(getOrders);
