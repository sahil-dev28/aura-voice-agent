export type OrderStatus = "PROCESSING" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED";

export type OrderView = {
  orderId: string;
  customerName: string;
  product: string;
  valueInr: number;
  status: OrderStatus;
  carrier?: string;
  trackingId?: string;
  orderedAt: string;
  deliveredAt?: string;
  expectedBy?: string;
  shippingFeeInr: number;
  codEligible: boolean;
  deliveredDaysAgo?: number;
};

export type TokenResponse = { token: string; model: string; expiresAt: string };

export type CallOutcome = {
  customer_intent: string;
  order_id: string | null;
  resolution_status: "RESOLVED" | "UNRESOLVED" | "POLICY_DECLINED" | "ESCALATION_NEEDED";
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  policy_flags: string[];
  call_summary: string;
  follow_up_required: boolean;
};

export type TranscriptRole = "customer" | "agent" | "tool";
export type TranscriptEntry = { id: string; role: TranscriptRole; text: string; ts: number };

export type ToolEvent = { id: string; name: string; args: Record<string, unknown>; result: unknown; ts: number };

export type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; outcome: CallOutcome }
  | { status: "error"; message: string };
