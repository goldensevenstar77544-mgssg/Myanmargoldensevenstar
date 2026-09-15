import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getClientStorage } from "@/lib/firebase/client";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  type TransactionAttachment,
} from "@/lib/types";
import { validateAttachmentInput } from "@/lib/image-compression";

export { validateAttachmentInput };

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "image";
}

/** Post-compression checks aligned with Storage rules (5MB, jpeg/png/webp). */
export function validateAttachmentFile(file: File): string | null {
  if (
    !(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)
  ) {
    return "Only JPEG, PNG, or WebP images are allowed.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Each image must be 5MB or smaller.";
  }
  return null;
}

export async function uploadTransactionImage(params: {
  transactionId: string;
  file: File;
  uploadedBy: string;
}): Promise<TransactionAttachment> {
  const error = validateAttachmentFile(params.file);
  if (error) throw new Error(error);

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `transactions/${params.transactionId}/${id}-${safeFileName(params.file.name)}`;
  const storageRef = ref(getClientStorage(), path);
  await uploadBytes(storageRef, params.file, {
    contentType: params.file.type,
  });
  const url = await getDownloadURL(storageRef);

  return {
    path,
    url,
    name: params.file.name,
    contentType: params.file.type,
    size: params.file.size,
    uploadedAt: new Date(),
    uploadedBy: params.uploadedBy,
  };
}

export async function deleteTransactionImage(path: string): Promise<void> {
  await deleteObject(ref(getClientStorage(), path));
}

export async function uploadTransactionImages(params: {
  transactionId: string;
  files: File[];
  uploadedBy: string;
}): Promise<TransactionAttachment[]> {
  const results: TransactionAttachment[] = [];
  for (const file of params.files) {
    results.push(
      await uploadTransactionImage({
        transactionId: params.transactionId,
        file,
        uploadedBy: params.uploadedBy,
      })
    );
  }
  return results;
}
