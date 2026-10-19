import { Behavior, type FunctionDeclaration, Type } from "@google/genai";

import { escalationReasons, orderActions } from "@/schema/tool";

export const toolNames = ["get_order_details", "check_order_action", "confirm_order_action", "escalate_to_human"] as const;
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
        phone_last4: {
          type: Type.STRING,
          description: "The last four digits of the phone number on the order, as the customer said them.",
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
        phone_last4: {
          type: Type.STRING,
          description: "The last four digits of the phone number on the order, as the customer said them.",
        },
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
        phone_last4: {
          type: Type.STRING,
          description: "The last four digits of the phone number on the order, as the customer said them.",
        },
        action: { type: Type.STRING, enum: [...orderActions], description: "The action the customer confirmed." },
        product_opened: {
          type: Type.BOOLEAN,
          description: "For returns only: whether the customer said the product has been opened or used.",
        },
      },
      required: ["order_id", "action"],
    },
  },
  {
    name: "escalate_to_human",
    behavior: Behavior.BLOCKING,
    description:
      "Hand the customer over to a human support specialist by opening a callback ticket. Call this straight away when the customer asks for a person, or after the customer agrees to it when you offer it.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING, enum: [...escalationReasons], description: "Why the customer needs a human." },
        order_id: { type: Type.STRING, description: "The order this is about, if the customer gave one." },
        note: {
          type: Type.STRING,
          description: "One or two sentences for the specialist: what the customer wants and what you already told them.",
        },
      },
      required: ["reason", "note"],
    },
  },
];
