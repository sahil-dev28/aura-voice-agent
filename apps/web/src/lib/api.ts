import { env } from "@aura/env/web";

import type { CallMetrics } from "@/lib/live/metrics";
import type { CallOutcome, OrderView, PhotoUpload, TokenResponse } from "@/lib/types";

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

export const getToken = (resumeHandle?: string) =>
  request<TokenResponse>("/api/token", {
    method: "POST",
    body: JSON.stringify(resumeHandle ? { resume_handle: resumeHandle } : {}),
  });

export const getOrders = () => request<OrderView[]>("/api/orders");

export const callTool = (name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  request<unknown>(`/api/tools/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(args), signal });

// The server tries two models with a 20 s limit each, so the browser gives up a little after that.
const SUMMARY_TIMEOUT_MS = 60_000;

export const getSummary = (body: { transcript: { role: string; text: string; ts: number }[]; toolEvents: unknown[] }) =>
  request<CallOutcome>("/api/summary", {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
  });

export const uploadReplacementPhoto = (referenceId: string, photo: { mime_type: string; data: string }) =>
  request<PhotoUpload>(`/api/replacements/${encodeURIComponent(referenceId)}/photos`, {
    method: "POST",
    body: JSON.stringify(photo),
  });

export const sendMetrics = (metrics: CallMetrics) =>
  request<{ received: boolean }>("/api/metrics", { method: "POST", body: JSON.stringify(metrics) });
