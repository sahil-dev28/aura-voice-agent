import { bytesToBase64 } from "@/lib/audio/pcm";

const MAX_SIDE = 1280;
const MAX_BYTES = 650_000;

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Phone photos are several MB; re-encoding as a smaller JPEG keeps each upload under the server's limit.
export async function preparePhoto(file: File): Promise<{ mime_type: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) {
      return { mime_type: "image/jpeg", data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
    }
  }
  throw new Error("That photo is too large, please try a smaller one.");
}
