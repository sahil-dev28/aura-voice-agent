import { z } from "zod";

export const photoMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_PHOTO_BYTES = 700_000;

export const photoUploadSchema = z.object({
  mime_type: z.enum(photoMimeTypes, { error: "mime_type must be image/jpeg, image/png or image/webp" }),
  data: z.string({ error: "data is required" }).min(1, { error: "data is required" }).max(1_000_000),
});

export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;
