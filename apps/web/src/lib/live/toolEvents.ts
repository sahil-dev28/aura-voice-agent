type LookupResult = { found?: boolean; order?: { orderId?: string; status?: string }; heard?: string; error?: string };
type ActionResult = LookupResult & {
  orderId?: string;
  eligible?: boolean;
  reasonCode?: string;
  confirmed?: boolean;
  referenceId?: string;
  escalated?: boolean;
  ticketId?: string;
  reason?: string;
  photoUpload?: { maxPhotos: number; photoCount: number };
  photoCount?: number;
  verified?: boolean;
  maxPhotos?: number;
};

const humanStatus = (status = "") => status.toLowerCase().replaceAll("_", " ");

export function describeToolEvent(name: string, args: Record<string, unknown>, result: unknown): string {
  const r = (result ?? {}) as ActionResult;
  if (r.error) return `${name} failed: ${r.error}`;
  if (r.verified === false) {
    const outcome = { VERIFICATION_FAILED: "failed", VERIFICATION_LOCKED: "locked" }[r.reason ?? ""] ?? "needed";
    return `Verification ${outcome} for ${r.orderId}`;
  }
  if (r.found === false) return `No order found for "${r.heard ?? String(args.order_id ?? "")}"`;
  if (name === "get_order_details") return `Looked up ${r.order?.orderId}: ${humanStatus(r.order?.status)}`;
  if (name === "check_order_action") {
    const verdict = r.eligible ? "eligible" : `not eligible (${r.reasonCode})`;
    return `Checked ${String(args.action)} for ${r.orderId}: ${verdict}`;
  }
  if (name === "confirm_order_action") {
    return r.confirmed
      ? `Recorded ${String(args.action)} for ${r.orderId}: ref ${r.referenceId}`
      : `Could not record ${String(args.action)} for ${r.orderId}: not eligible (${r.reasonCode})`;
  }
  if (name === "photo_upload") return `Photos received for ${r.referenceId}: ${r.photoCount} of ${r.maxPhotos}`;
  if (name === "escalate_to_human") return `Escalated to human: ${r.ticketId} (${humanStatus(r.reason)})`;
  return `Called ${name}`;
}

export function findEscalation(events: { name: string; result: unknown }[]): unknown {
  return events.find((event) => event.name === "escalate_to_human" && (event.result as ActionResult)?.escalated)?.result;
}

export function findReplacement(
  events: { name: string; result: unknown }[],
): { referenceId: string; maxPhotos: number; photoCount: number } | undefined {
  for (const event of events) {
    const r = event.result as ActionResult;
    if (event.name === "confirm_order_action" && r?.confirmed && r.referenceId && r.photoUpload) {
      return { referenceId: r.referenceId, ...r.photoUpload };
    }
  }
  return undefined;
}

export function filterCancelled<T extends { id?: string }>(responses: T[], cancelled: ReadonlySet<string>): T[] {
  return responses.filter((response) => !response.id || !cancelled.has(response.id));
}
