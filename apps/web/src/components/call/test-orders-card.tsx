"use client";

import { useEffect, useState } from "react";

import { Badge } from "@aura/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";

import { getOrders } from "@/lib/api";
import type { OrderView } from "@/lib/types";

type OrderRow = Pick<OrderView, "orderId" | "customerName" | "product" | "valueInr" | "status"> & {
  note: string;
};

const FALLBACK: OrderRow[] = [
  {
    orderId: "ORD-101",
    customerName: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    valueInr: 699,
    status: "OUT_FOR_DELIVERY",
    note: "BlueDart BD-982103 · expected by 6 PM today",
  },
  {
    orderId: "ORD-102",
    customerName: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    valueInr: 499,
    status: "DELIVERED",
    note: "Delhivery DL-441029 · delivered 14 days ago",
  },
  {
    orderId: "ORD-103",
    customerName: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    valueInr: 850,
    status: "PROCESSING",
    note: "Ordered 3 hours ago · can be cancelled",
  },
  {
    orderId: "ORD-104",
    customerName: "Karan Mehta",
    product: "Niacinamide 10% Serum",
    valueInr: 549,
    status: "DELIVERED",
    note: "Delhivery DL-552310 · delivered 20 hours ago",
  },
];

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

function deliveredAgo(order: OrderView): string {
  if (order.deliveredDaysAgo) return `${order.deliveredDaysAgo} days ago`;
  const hours = order.deliveredAt ? Math.round((Date.now() - new Date(order.deliveredAt).getTime()) / 3_600_000) : 0;
  return `${hours} hours ago`;
}

function toRow(order: OrderView): OrderRow {
  const note =
    order.status === "OUT_FOR_DELIVERY" && order.expectedBy
      ? `${order.carrier} ${order.trackingId} · expected by ${istTime(order.expectedBy)} today`
      : order.status === "DELIVERED"
        ? `${order.carrier} ${order.trackingId} · delivered ${deliveredAgo(order)}`
        : "Ordered 3 hours ago · can be cancelled";
  return { ...order, note };
}

export function TestOrdersCard() {
  const [orders, setOrders] = useState<OrderRow[]>(FALLBACK);

  useEffect(() => {
    getOrders()
      .then((data) => setOrders(data.map(toRow)))
      .catch(() => setOrders(FALLBACK));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test orders</CardTitle>
        <CardDescription>
          Mention any of these order IDs during the call.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {orders.map((order) => (
            <li key={order.orderId} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{order.orderId}</span>
                <Badge variant="secondary">{order.status.replaceAll("_", " ").toLowerCase()}</Badge>
              </div>
              <p className="mt-1">
                {order.product} · ₹{order.valueInr}
              </p>
              <p className="text-muted-foreground">
                {order.customerName} · {order.note}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
