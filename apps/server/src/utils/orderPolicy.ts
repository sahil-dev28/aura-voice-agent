import { DAY_MS, HOUR_MS, type Order } from "@/data/orders";

export type Decision = { eligible: boolean; reasonCode: string; explanation: string; nextStep: string };

export const FREE_SHIPPING_MIN_INR = 499;
export const SHIPPING_FEE_INR = 50;
export const COD_MAX_INR = 2500;
export const RETURN_WINDOW_DAYS = 7;
export const DAMAGE_WINDOW_HOURS = 48;

export const shippingFee = (valueInr: number): number => (valueInr >= FREE_SHIPPING_MIN_INR ? 0 : SHIPPING_FEE_INR);

export const isCodEligible = (valueInr: number): boolean => valueInr <= COD_MAX_INR;

export const daysSince = (date: Date, now: Date): number => Math.floor((now.getTime() - date.getTime()) / DAY_MS);

const notDelivered = (order: Order): Decision => ({
  eligible: false,
  reasonCode: "NOT_YET_DELIVERED",
  explanation: `Order ${order.orderId} has not been delivered yet, so this can only be checked after delivery.`,
  nextStep: "Wait for the delivery, then contact us again if needed.",
});

export function canCancel(order: Order): Decision {
  switch (order.status) {
    case "PROCESSING":
      return {
        eligible: true,
        reasonCode: "CANCELLABLE",
        explanation: `Order ${order.orderId} is still processing, so it can be cancelled.`,
        nextStep: "The cancellation request has been recorded.",
      };
    case "SHIPPED":
    case "OUT_FOR_DELIVERY":
      return {
        eligible: false,
        reasonCode: "NOT_CANCELLABLE_IN_TRANSIT",
        explanation: `Order ${order.orderId} has already left our warehouse, and orders can only be cancelled while they are processing.`,
        nextStep: "The customer may refuse the delivery at the doorstep.",
      };
    case "DELIVERED":
      return {
        eligible: false,
        reasonCode: "ALREADY_DELIVERED",
        explanation: `Order ${order.orderId} has already been delivered, so it cannot be cancelled.`,
        nextStep: "A return may be possible within 7 days of delivery if the product is unopened and unused.",
      };
  }
}

export function canReturn(order: Order, facts: { productOpened?: boolean }, now: Date): Decision {
  if (order.status !== "DELIVERED" || !order.deliveredAt) return notDelivered(order);

  const days = daysSince(order.deliveredAt, now);
  if (now.getTime() - order.deliveredAt.getTime() > RETURN_WINDOW_DAYS * DAY_MS) {
    return {
      eligible: false,
      reasonCode: "RETURN_WINDOW_EXPIRED",
      explanation: `Order ${order.orderId} was delivered ${days} days ago, and returns are accepted only within 7 days of delivery.`,
      nextStep: "If the product arrived damaged or defective, that had to be reported within 48 hours of delivery.",
    };
  }
  if (facts.productOpened === undefined) {
    return {
      eligible: false,
      reasonCode: "NEEDS_INFO",
      explanation: "Returns are accepted only for unopened, unused products in original packaging.",
      nextStep: "Ask the customer whether the product has been opened or used.",
    };
  }
  if (facts.productOpened) {
    return {
      eligible: false,
      reasonCode: "PRODUCT_OPENED",
      explanation:
        "Returns are accepted only for unopened, unused products in original packaging, so an opened product cannot be returned.",
      nextStep:
        "If the product is damaged or defective, it can be reported within 48 hours of delivery with photos for a replacement.",
    };
  }
  return {
    eligible: true,
    reasonCode: "RETURNABLE",
    explanation: `Order ${order.orderId} was delivered ${days} days ago and is unopened, so it is within the 7-day return policy.`,
    nextStep: "The return request has been recorded. Keep the product unused in its original packaging.",
  };
}

export function canReplaceDamaged(order: Order, now: Date): Decision {
  if (order.status !== "DELIVERED" || !order.deliveredAt) return notDelivered(order);

  if (now.getTime() - order.deliveredAt.getTime() > DAMAGE_WINDOW_HOURS * HOUR_MS) {
    return {
      eligible: false,
      reasonCode: "DAMAGE_REPORT_WINDOW_EXPIRED",
      explanation:
        "Damaged or defective products must be reported within 48 hours of delivery, and that window has passed for this order.",
      nextStep: "No replacement can be offered under the current policy.",
    };
  }
  return {
    eligible: true,
    reasonCode: "REPLACEMENT_ELIGIBLE",
    explanation: "This is within 48 hours of delivery, so a damaged or defective product can be replaced.",
    nextStep: "The replacement request has been recorded. The customer needs to share photos of the damage.",
  };
}
