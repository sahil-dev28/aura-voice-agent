import { randomBytes } from "node:crypto";

import type { OrderAction } from "@/schema/tool";

export type PhotoRecord = { mimeType: string; bytes: number; receivedAt: Date };
export type RecordedRequest = { referenceId: string; orderId: string; action: OrderAction; photos: PhotoRecord[] };

const REFERENCE_PREFIX: Record<OrderAction, string> = { cancel: "CXL", return: "RET", damage_replacement: "RPL" };

export const MAX_PHOTOS = 3;

const references = new Map<string, string>();
const requests = new Map<string, RecordedRequest>();

const newId = (prefix: string) => `${prefix}-${randomBytes(2).toString("hex").toUpperCase()}`;

export function recordRequest(orderId: string, action: OrderAction): string {
  const key = `${orderId}:${action}`;
  const existing = references.get(key);
  if (existing) return existing;
  const referenceId = newId(REFERENCE_PREFIX[action]);
  references.set(key, referenceId);
  requests.set(referenceId, { referenceId, orderId, action, photos: [] });
  return referenceId;
}

export const getRequest = (referenceId: string): RecordedRequest | undefined => requests.get(referenceId);

// Only metadata is kept; a real system would put the image in object storage.
export function addPhoto(request: RecordedRequest, photo: PhotoRecord): boolean {
  if (request.photos.length >= MAX_PHOTOS) return false;
  request.photos.push(photo);
  return true;
}

export const openTicket = (): string => newId("ESC");
