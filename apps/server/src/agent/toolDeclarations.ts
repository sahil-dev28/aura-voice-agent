import { Behavior, type FunctionDeclaration, Type } from "@google/genai";

import { orderActions } from "@/schema/tool";

export const toolNames = ["get_order_details", "check_order_action", "confirm_order_action"] as const;
export type ToolName = (typeof toolNames)[number];

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_order_details",
    behavior: Behavior.BLOCKING,
    description:
      "Fetch live details for one Aura Skincare order: status, product, value, carrier, expected or actual delivery date, shipping fee, COD eligibility and whether it can be cancelled. Call this whenever the customer asks anything about a specific order.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        order_id: {
          type: Type.STRING,
          description: "The order ID exactly as the customer said it, for example ORD-101 or 101.",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "check_order_action",
    behavior: Behavior.BLOCKING,
    description:
      "Check whether a cancellation, return or damaged-product replacement is allowed for an order under Aura policy. This only checks and does not record anything. Call this before telling the customer whether they can do any of these.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        order_id: { type: Type.STRING, description: "The order ID, for example ORD-102." },
        action: { type: Type.STRING, enum: [...orderActions], description: "What the customer wants to do." },
        product_opened: {
          type: Type.BOOLEAN,
          description: "For returns only: whether the customer said the product has been opened or used. Omit if unknown.",
        },
      },
      required: ["order_id", "action"],
    },
  },
  {
    name: "confirm_order_action",
    behavior: Behavior.BLOCKING,
    description:
      "Record a cancellation, return or damaged-product replacement and get its reference ID. Call this only after check_order_action returned eligible true and the customer has clearly said yes to going ahead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        order_id: { type: Type.STRING, description: "The order ID, for example ORD-103." },
        action: { type: Type.STRING, enum: [...orderActions], description: "The action the customer confirmed." },
        product_opened: {
          type: Type.BOOLEAN,
          description: "For returns only: whether the customer said the product has been opened or used.",
        },
      },
      required: ["order_id", "action"],
    },
  },
];
