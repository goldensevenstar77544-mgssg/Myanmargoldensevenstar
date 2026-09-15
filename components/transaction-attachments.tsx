"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  compressAttachmentImage,
  validateAttachmentInput,
} from "@/lib/image-compression";
import {
  deleteTransactionImage,
  uploadTransactionImage,
  validateAttachmentFile,
} from "@/lib/firebase/storage";
import { updateTransaction } from "@/lib/firebase/firestore";
import {
  MAX_TRANSACTION_ATTACHMENTS,
  type TransactionAttachment,
} from "@/lib/types";

export interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

interface ProcessingItem {
  id: string;
  name: string;
  previewUrl: string | null;
  status: "compressing" | "uploading";
}

interface TransactionAttachmentsProps {
  /** Saved attachments on an existing transaction */
  attachments?: TransactionAttachment[];
  /** Local files selected before the transaction exists */
  pendingFiles?: PendingFile[];
  onPendingFilesChange?: (files: PendingFile[]) => void;
  /** When set with editable, uploads go straight to Storage + Firestore */
  transactionId?: string;
  uploadedBy?: string;
  actorName?: string;
  editable?: boolean;
  onAttachmentsChange?: (attachments: TransactionAttachment[]) => void;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function revokePendingFiles(files: PendingFile[]) {
  for (const f of files) URL.revokeObjectURL(f.previewUrl);
}

export function TransactionAttachments({
  attachments = [],
  pendingFiles = [],
  onPendingFilesChange,
  transactionId,
  uploadedBy,
  actorName,
  editable = false,
  onAttachmentsChange,
}: TransactionAttachmentsProps) {
  const confirm = useConfirm();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<ProcessingItem[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null
  );

  const totalCount =
    attachments.length + pendingFiles.length + processing.length;
  const canAdd = editable && totalCount < MAX_TRANSACTION_ATTACHMENTS;
  const isProcessing = busy || processing.length > 0;

  function clearFileInputs() {
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function revokeProcessingPreview(item: ProcessingItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }

  async function handleFilesSelected(list: FileList | null) {
    if (!list?.length) return;
    const remaining = MAX_TRANSACTION_ATTACHMENTS - totalCount;
    const selected = Array.from(list).slice(0, remaining);
    clearFileInputs();
    if (!selected.length) return;

    const immediateUpload = Boolean(
      transactionId && uploadedBy && onAttachmentsChange
    );
    const pendingMode = Boolean(onPendingFilesChange);

    if (!immediateUpload && !pendingMode) return;

    const starters: ProcessingItem[] = [];
    const filesToProcess: { item: ProcessingItem; file: File }[] = [];

    for (const file of selected) {
      const inputError = validateAttachmentInput(file);
      if (inputError) {
        toast.error(inputError);
        continue;
      }
      const item: ProcessingItem = {
        id: newId(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: "compressing",
      };
      starters.push(item);
      filesToProcess.push({ item, file });
    }

    if (!filesToProcess.length) return;

    setProcessing((prev) => [...prev, ...starters]);

    const uploadedBatch: TransactionAttachment[] = [];
    const pendingBatch: PendingFile[] = [];
    const finishedIds: string[] = [];

    function dropProcessing(ids: string[]) {
      if (!ids.length) return;
      setProcessing((prev) => {
        const drop = new Set(ids);
        for (const p of prev) {
          if (drop.has(p.id)) revokeProcessingPreview(p);
        }
        return prev.filter((p) => !drop.has(p.id));
      });
    }

    for (const { item, file } of filesToProcess) {
      try {
        const compressed = await compressAttachmentImage(file);
        const finalError = validateAttachmentFile(compressed);
        if (finalError) {
          toast.error(finalError);
          dropProcessing([item.id]);
          continue;
        }

        if (immediateUpload && transactionId && uploadedBy) {
          setProcessing((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, status: "uploading" as const } : p
            )
          );
          const uploaded = await uploadTransactionImage({
            transactionId,
            file: compressed,
            uploadedBy,
          });
          uploadedBatch.push(uploaded);
          finishedIds.push(item.id);
        } else {
          pendingBatch.push({
            id: item.id,
            file: compressed,
            previewUrl: URL.createObjectURL(compressed),
          });
          finishedIds.push(item.id);
        }
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Could not process image"
        );
        dropProcessing([item.id]);
      }
    }

    if (pendingBatch.length && onPendingFilesChange) {
      onPendingFilesChange([...pendingFiles, ...pendingBatch]);
      dropProcessing(finishedIds);
      return;
    }

    if (
      uploadedBatch.length &&
      transactionId &&
      uploadedBy &&
      onAttachmentsChange
    ) {
      setBusy(true);
      try {
        const next = [...attachments, ...uploadedBatch];
        await updateTransaction(
          transactionId,
          { attachments: next },
          {
            actorId: uploadedBy,
            actorName: actorName?.trim() || uploadedBy,
          }
        );
        onAttachmentsChange(next);
        toast.success(
          uploadedBatch.length === 1
            ? "Image uploaded"
            : `${uploadedBatch.length} images uploaded`
        );
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Upload failed"
        );
      } finally {
        dropProcessing(finishedIds);
        setBusy(false);
      }
      return;
    }

    dropProcessing(finishedIds);
  }

  async function removeSaved(attachment: TransactionAttachment) {
    if (!transactionId || !onAttachmentsChange || !uploadedBy) return;
    const ok = await confirm({
      title: "Delete this attachment?",
      description: `“${attachment.name}” will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      try {
        await deleteTransactionImage(attachment.path);
      } catch (error) {
        console.warn("Storage delete failed (continuing)", error);
      }
      const next = attachments.filter((a) => a.path !== attachment.path);
      await updateTransaction(
        transactionId,
        { attachments: next },
        {
          actorId: uploadedBy,
          actorName: actorName?.trim() || uploadedBy,
        }
      );
      onAttachmentsChange(next);
      toast.success("Image removed");
    } catch (error) {
      console.error(error);
      toast.error("Could not remove image");
    } finally {
      setBusy(false);
    }
  }

  function removePending(id: string) {
    if (!onPendingFilesChange) return;
    const target = pendingFiles.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onPendingFilesChange(pendingFiles.filter((f) => f.id !== id));
  }

  const statusLabel = (status: ProcessingItem["status"]) =>
    status === "compressing" ? "Compressing…" : "Uploading…";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Label>Invoice / voucher images</Label>
          <p className="text-xs text-zinc-500">
            Optional. Photos are compressed automatically. Up to{" "}
            {MAX_TRANSACTION_ATTACHMENTS} images (JPEG, PNG, or WebP).
          </p>
        </div>
        {canAdd && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => galleryInputRef.current?.click()}
            >
              {isProcessing ? (
                <>
                  <LoadingDots size="sm" />
                  Working…
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Add images
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Take photo
            </Button>
          </div>
        )}
      </div>

      {totalCount === 0 ? (
        <p className="text-sm text-zinc-500">
          No images attached. Add a photo of the invoice or voucher if you have
          one.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((a) => (
            <div
              key={a.path}
              className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
            >
              <button
                type="button"
                className="block w-full"
                onClick={() => setPreview({ url: a.url, name: a.name })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-28 w-full object-cover"
                />
              </button>
              <p className="truncate px-2 py-1 text-xs text-zinc-600">{a.name}</p>
              {editable && (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute right-2 top-2 h-8 w-8 opacity-90"
                  disabled={isProcessing}
                  onClick={() => removeSaved(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {pendingFiles.map((f) => (
            <div
              key={f.id}
              className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
            >
              <button
                type="button"
                className="block w-full"
                onClick={() =>
                  setPreview({ url: f.previewUrl, name: f.file.name })
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.previewUrl}
                  alt={f.file.name}
                  className="h-28 w-full object-cover"
                />
              </button>
              <p className="truncate px-2 py-1 text-xs text-zinc-600">
                {f.file.name}
              </p>
              {editable && (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute right-2 top-2 h-8 w-8 opacity-90"
                  disabled={isProcessing}
                  onClick={() => removePending(f.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {processing.map((p) => (
            <div
              key={p.id}
              className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
            >
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.previewUrl}
                  alt={p.name}
                  className="h-28 w-full object-cover opacity-60"
                />
              ) : (
                <div className="h-28 w-full bg-zinc-100" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-zinc-950/45 px-2 text-center text-white">
                <LoadingDots size="sm" />
                <span className="text-xs font-medium">
                  {statusLabel(p.status)}
                </span>
              </div>
              <p className="truncate px-2 py-1 text-xs text-zinc-600">{p.name}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
