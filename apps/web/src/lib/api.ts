import { env } from "@aura/env/web";

import type { CallOutcome, OrderView, TokenResponse } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || body.data === undefined) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body.data;
}

export const getToken = () => request<TokenResponse>("/api/token", { method: "POST" });

export const getOrders = () => request<OrderView[]>("/api/orders");

export const callTool = (name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  request<unknown>(`/api/tools/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(args), signal });

export const getSummary = (body: { transcript: { role: string; text: string; ts: number }[]; toolEvents: unknown[] }) =>
  request<CallOutcome>("/api/summary", { method: "POST", body: JSON.stringify(body) });
