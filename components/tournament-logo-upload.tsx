"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useCallback, useRef, useState } from "react";

interface Props {
  /** Null for the create flow — uploads defer to the first save. */
  tournamentId: string | null;
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
}

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;
// Reject obviously-oversized raw uploads before we try to decode
// them. createImageBitmap has to load the full file into memory
// first, and phones will OOM on a 40MB HEIC / RAW / TIFF. Most real
// logos are well under 5MB.
const MAX_RAW_BYTES = 10 * 1024 * 1024;

/**
 * Resize + convert to JPEG via canvas. Same pattern as AvatarUpload,
 * with HEIC fallback for iOS photos. Exported as a blob so the
 * uploader can hand it straight to Supabase Storage.
 */
async function processImage(file: File): Promise<Blob> {
  let imageBlob: Blob = file;
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  if (isHeic) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    imageBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  const bitmap = await createImageBitmap(imageBlob);
  const { width, height } = bitmap;
  let newW = width;
  let newH = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      newW = MAX_DIMENSION;
      newH = Math.round((height / width) * MAX_DIMENSION);
    } else {
      newH = MAX_DIMENSION;
      newW = Math.round((width / height) * MAX_DIMENSION);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to process image"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Square logo uploader for a tournament. Organizers of a specific
 * tournament can upload via the edit page; the create page can't
 * upload yet (no tournament id) so it disables the button and shows
 * a hint to save first. RLS on the bucket enforces that only the
 * tournament's creator, co-organizers, or admins can write.
 */
export function TournamentLogoUpload({ tournamentId, currentUrl, onUploaded }: Props) {
  const { supabase } = useSupabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!tournamentId) {
        setError("Save the tournament first, then upload a logo.");
        return;
      }
      if (file.size > MAX_RAW_BYTES) {
        setError(
          `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — too large. Try one under 10MB or resize it first.`
        );
        return;
      }
      setError(null);
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setUploading(true);

      try {
        const processed = await processImage(file);
        const path = `${tournamentId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("tournament-logos")
          .upload(path, processed, { upsert: true, contentType: "image/jpeg" });
        if (upErr) throw upErr;

        const { data } = supabase.storage.from("tournament-logos").getPublicUrl(path);
        URL.revokeObjectURL(objectUrl);
        setPreview(data.publicUrl);
        onUploaded(data.publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setPreview(currentUrl);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [supabase, tournamentId, currentUrl, onUploaded]
  );

  function handleRemove() {
    setPreview(null);
    onUploaded(null);
  }

  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !tournamentId}
        className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden border-2 border-dashed border-surface-border hover:border-brand-400 bg-surface-overlay focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Upload logo"
      >
        {preview ? (
          <img src={preview} alt="Logo preview" className="h-full w-full object-contain p-1" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-surface-muted">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75 8.47 9.53a2.25 2.25 0 0 1 3.18 0l4.84 4.84m2.25-2.25 2.28-2.28a2.25 2.25 0 0 1 3.18 0l.8.8M2.25 15.75v3A2.25 2.25 0 0 0 4.5 21h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15A2.25 2.25 0 0 0 2.25 6.75v9Zm10-5.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-dark-100">
            …
          </div>
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-dark-100">Tournament logo (optional)</p>
        <p className="text-xs text-surface-muted">
          {tournamentId
            ? "Square image, 512px recommended. Shows on the tournament card and hero."
            : "Save the tournament first — you can add a logo from the edit page after."}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !tournamentId}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            {uploading ? "Uploading…" : preview ? "Change" : "Upload"}
          </button>
          {preview && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="btn-secondary text-xs !text-red-400 !border-red-500/40 hover:!bg-red-900/20"
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handle}
        className="hidden"
      />
    </div>
  );
}
