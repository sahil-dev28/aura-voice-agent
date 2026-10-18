type LookupResult = { found?: boolean; order?: { orderId?: string; status?: string }; heard?: string; error?: string };
type ActionResult = LookupResult & { orderId?: string; eligible?: boolean; reasonCode?: string; referenceId?: string };

const humanStatus = (status = "") => status.toLowerCase().replaceAll("_", " ");

export function describeToolEvent(name: string, args: Record<string, unknown>, result: unknown): string {
  const r = (result ?? {}) as ActionResult;
  if (r.error) return `${name} failed: ${r.error}`;
  if (r.found === false) return `No order found for "${r.heard ?? String(args.order_id ?? "")}"`;
  if (name === "get_order_details") return `Looked up ${r.order?.orderId}: ${humanStatus(r.order?.status)}`;
  if (name === "check_order_action") {
    const verdict = r.eligible
      ? `eligible${r.referenceId ? `, ref ${r.referenceId}` : ""}`
      : `not eligible (${r.reasonCode})`;
    return `Checked ${String(args.action)} for ${r.orderId}: ${verdict}`;
  }
  return `Called ${name}`;
}

export function filterCancelled<T extends { id?: string }>(responses: T[], cancelled: ReadonlySet<string>): T[] {
  return responses.filter((response) => !response.id || !cancelled.has(response.id));
}
