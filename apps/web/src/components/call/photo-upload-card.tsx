"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@aura/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";

import { uploadReplacementPhoto } from "@/lib/api";
import { preparePhoto } from "@/lib/photos";
import type { PhotoUpload } from "@/lib/types";

type Props = {
  referenceId: string;
  maxPhotos: number;
  photoCount: number;
  onUploaded: (upload: PhotoUpload) => void;
  onBusy: (busy: boolean) => void;
};

export function PhotoUploadCard({ referenceId, maxPhotos, photoCount, onUploaded, onBusy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [count, setCount] = useState(photoCount);
  const created = useRef<string[]>([]);
  const full = count >= maxPhotos;

  useEffect(() => () => created.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Closing the picker without choosing a file fires "cancel", which React doesn't expose on inputs.
  useEffect(() => {
    const input = inputRef.current;
    const idle = () => onBusy(false);
    input?.addEventListener("cancel", idle);
    return () => input?.removeEventListener("cancel", idle);
  }, [onBusy]);

  function choose() {
    onBusy(true);
    inputRef.current?.click();
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return onBusy(false);
    setUploading(true);
    for (const file of Array.from(files).slice(0, maxPhotos - count)) {
      try {
        const result = await uploadReplacementPhoto(referenceId, await preparePhoto(file));
        const url = URL.createObjectURL(file);
        created.current.push(url);
        setPreviews((current) => [...current, url]);
        setCount(result.photoCount);
        onUploaded(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't upload that photo");
      }
    }
    setUploading(false);
    onBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos of the damage</CardTitle>
        <CardDescription>
          Add up to {maxPhotos} photos for replacement request <span className="font-mono">{referenceId}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {previews.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {previews.map((url, index) => (
              <li key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={url} alt={`Damage photo ${index + 1}`} className="size-20 rounded-md border object-cover" />
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          hidden
          onChange={(event) => void upload(event.target.files)}
        />
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={uploading || full} onClick={choose}>
            {uploading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ImagePlus data-icon="inline-start" />}
            {uploading ? "Uploading…" : "Add photos"}
          </Button>
          <span className="text-muted-foreground text-sm">
            {count} of {maxPhotos} uploaded
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
