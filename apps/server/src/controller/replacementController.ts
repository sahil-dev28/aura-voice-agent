import type { Request, Response } from "express";

import { MAX_PHOTOS, addPhoto, getRequest } from "@/data/requests";
import { MAX_PHOTO_BYTES, type PhotoUploadInput } from "@/schema/replacement";
import { formatUnknownError } from "@/utils/formatUnknownError";

const SIGNATURES: Record<PhotoUploadInput["mime_type"], (bytes: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

export const uploadReplacementPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mime_type, data } = req.body as PhotoUploadInput;
    const request = getRequest(String(req.params.referenceId));
    if (!request || request.action !== "damage_replacement") {
      res.status(404).json({ error: "Replacement request not found" });
      return;
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_PHOTO_BYTES) {
      res.status(400).json({ error: "Photo is too large, the limit is 700 KB" });
      return;
    }
    if (!SIGNATURES[mime_type](bytes)) {
      res.status(400).json({ error: "Photo must be a JPEG, PNG or WebP image" });
      return;
    }
    if (!addPhoto(request, { mimeType: mime_type, bytes: bytes.length, receivedAt: new Date() })) {
      res.status(409).json({ error: `This request already has ${MAX_PHOTOS} photos` });
      return;
    }
    res.status(200).json({
      data: {
        referenceId: request.referenceId,
        orderId: request.orderId,
        photoCount: request.photos.length,
        maxPhotos: MAX_PHOTOS,
      },
    });
    return;
  } catch (error) {
    res.status(500).json(formatUnknownError(error));
  }
};
