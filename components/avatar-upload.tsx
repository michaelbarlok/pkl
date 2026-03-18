"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

interface AvatarUploadProps {
  profileId: string;
  currentUrl: string | null;
  onUpload: (url: string) => void;
}

const MAX_DIMENSION = 512; // Resize to 512x512 max
const JPEG_QUALITY = 0.85;

/**
 * Resize an image file to MAX_DIMENSION and convert to JPEG.
 * Handles HEIC by using heic2any, and any other image format via Canvas.
 */
async function processImage(file: File): Promise<Blob> {
  let imageBlob: Blob = file;

  // Convert HEIC/HEIF to JPEG first
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

  // Load into an Image element
  const bitmap = await createImageBitmap(imageBlob);
  const { width, height } = bitmap;

  // Calculate new dimensions preserving aspect ratio
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

  // Draw to canvas and export as JPEG
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to process image"));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export function AvatarUpload({ profileId, currentUrl, onUpload }: AvatarUploadProps) {
  const { supabase } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      // Show local preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      setUploading(true);

      try {
        // Auto-resize and convert to JPEG
        const processed = await processImage(file);

        const filePath = `${profileId}/${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, processed, {
            upsert: true,
            contentType: "image/jpeg",
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Update the profile row
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", profileId);

        if (updateError) {
          throw updateError;
        }

        URL.revokeObjectURL(objectUrl);
        setPreviewUrl(publicUrl);
        onUpload(publicUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
        setError(message);
        // Revert preview on error
        setPreviewUrl(currentUrl);
      } finally {
        setUploading(false);
        // Reset file input so the same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [supabase, profileId, currentUrl, onUpload]
  );

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Preview */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "relative h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-brand-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
          uploading && "opacity-50 cursor-not-allowed"
        )}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Avatar preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-400">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
              />
            </svg>
          </div>
        )}

        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <svg
              className="h-6 w-6 animate-spin text-brand-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}
      </button>

      {/* Hidden file input — accept all image types including HEIC */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Label / action */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="text-sm text-brand-400 hover:text-brand-300 disabled:text-gray-400"
      >
        {uploading ? "Processing..." : previewUrl ? "Change photo" : "Upload photo"}
      </button>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
