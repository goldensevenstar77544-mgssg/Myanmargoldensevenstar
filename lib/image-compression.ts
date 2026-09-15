import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_MAX_EDGE_PX,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_INPUT_BYTES,
} from "@/lib/types";

const JPEG_QUALITY_START = 0.82;
const JPEG_QUALITY_MIN = 0.5;
const JPEG_QUALITY_STEP = 0.08;

export function validateAttachmentInput(file: File): string | null {
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPEG, PNG, or WebP images are allowed.";
  }
  if (file.size > MAX_ATTACHMENT_INPUT_BYTES) {
    return "Each image must be 25MB or smaller before compression.";
  }
  return null;
}

function jpegFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.jpg`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function getBitmapSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Resize and JPEG-compress invoice/receipt images for upload.
 * Always recompresses (including files already under 5MB) for smaller uploads.
 */
export async function compressAttachmentImage(file: File): Promise<File> {
  const inputError = validateAttachmentInput(file);
  if (inputError) throw new Error(inputError);

  let width: number;
  let height: number;
  try {
    ({ width, height } = await getBitmapSize(file));
  } catch {
    throw new Error("Could not read this image. Try another photo.");
  }

  const longest = Math.max(width, height);
  const scale =
    longest > ATTACHMENT_MAX_EDGE_PX ? ATTACHMENT_MAX_EDGE_PX / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: "high",
    });
  } catch {
    throw new Error("Could not process this image. Try another photo.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not compress image.");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  let quality = JPEG_QUALITY_START;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);

  while (blob.size > MAX_ATTACHMENT_BYTES && quality > JPEG_QUALITY_MIN + 0.001) {
    quality = Math.max(JPEG_QUALITY_MIN, quality - JPEG_QUALITY_STEP);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }

  if (blob.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      "Image is still over 5MB after compression. Try a clearer close-up or lower-resolution photo."
    );
  }

  // Prefer original only when recompression did not shrink and it already meets upload rules.
  if (blob.size >= file.size && file.size <= MAX_ATTACHMENT_BYTES) {
    return file;
  }

  return new File([blob], jpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
