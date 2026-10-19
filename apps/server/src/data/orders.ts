export const orderStatuses = ["PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export type Order = {
  orderId: string;
  customerName: string;
  phone: string;
  product: string;
  valueInr: number;
  status: OrderStatus;
  carrier?: string;
  trackingId?: string;
  orderedAt: Date;
  deliveredAt?: Date;
  expectedBy?: Date;
};

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

export function istTimeToday(now: Date, hour: number): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const utcOfIstMidnightPlusHour = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour);
  return new Date(utcOfIstMidnightPlusHour - IST_OFFSET_MS);
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

export function listOrders(now: Date = new Date()): Order[] {
  return [
    {
      orderId: "ORD-101",
      customerName: "Priya Sharma",
      phone: "+91 98201 43721",
      product: "Vitamin C Serum (30ml)",
      valueInr: 699,
      status: "OUT_FOR_DELIVERY",
      carrier: "BlueDart",
      trackingId: "BD-982103",
      orderedAt: ago(now, 2 * DAY_MS),
      expectedBy: istTimeToday(now, 18),
    },
    {
      orderId: "ORD-102",
      customerName: "Rahul Verma",
      phone: "+91 99307 15508",
      product: "Hydrating Sunscreen SPF 50",
      valueInr: 499,
      status: "DELIVERED",
      carrier: "Delhivery",
      trackingId: "DL-441029",
      orderedAt: ago(now, 18 * DAY_MS),
      deliveredAt: ago(now, 14 * DAY_MS),
    },
    {
      orderId: "ORD-103",
      customerName: "Ananya Patel",
      phone: "+91 98110 69264",
      product: "Green Tea Face Wash + Toner",
      valueInr: 850,
      status: "PROCESSING",
      orderedAt: ago(now, 3 * HOUR_MS),
    },
    // Not in the brief: the only order inside the 48-hour damage window, so replacements can be tested.
    {
      orderId: "ORD-104",
      customerName: "Karan Mehta",
      phone: "+91 97692 01187",
      product: "Niacinamide 10% Serum",
      valueInr: 549,
      status: "DELIVERED",
      carrier: "Delhivery",
      trackingId: "DL-552310",
      orderedAt: ago(now, 4 * DAY_MS),
      deliveredAt: ago(now, 20 * HOUR_MS),
    },
  ];
}

export function getOrder(orderId: string, now: Date = new Date()): Order | undefined {
  return listOrders(now).find((order) => order.orderId === orderId);
}
