import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import { Button } from "@repo/ui/components/button";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Spinner } from "@repo/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { FileIcon, FileTextIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { toastError } from "@/lib/toast";
import { useTRPC } from "@/lib/trpc";

const ACCEPT = "application/pdf,image/gif,image/jpeg,image/png,image/webp";
const MAX_TODO_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TODO_ATTACHMENTS = 10;

export interface TodoAttachmentItem {
  _id: string;
  contentType: string;
  fileName: string;
  height?: number;
  size: number;
  width?: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedType(contentType: string) {
  return (
    contentType === "application/pdf" ||
    contentType === "image/gif" ||
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  );
}

function readImageDimensions(file: File): Promise<{ height?: number; width?: number }> {
  if (!file.type.startsWith("image/")) {
    return Promise.resolve({});
  }

  return new Promise<{ height?: number; width?: number }>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    });
    image.src = objectUrl;
  });
}

function AttachmentMediaBody({
  attachment,
  isImage,
  previewUrl,
  isPending,
}: {
  attachment: TodoAttachmentItem;
  isImage: boolean;
  isPending: boolean;
  previewUrl: string | undefined;
}) {
  if (isPending) {
    return <Spinner />;
  }
  if (isImage && previewUrl) {
    return (
      <img alt={attachment.fileName} height={attachment.height ?? 96} src={previewUrl} width={attachment.width ?? 96} />
    );
  }
  if (attachment.contentType === "application/pdf") {
    return <FileTextIcon />;
  }
  return <FileIcon />;
}

function AttachmentPreview({
  attachment,
  isRemoving,
  onRemove,
  todoId,
}: {
  attachment: TodoAttachmentItem;
  isRemoving: boolean;
  onRemove: () => void;
  todoId: string;
}) {
  const trpc = useTRPC();
  const fileId = String(attachment._id);
  const preview = useQuery(
    trpc.todo.attachmentUrl.queryOptions({
      fileId,
      todoId,
    })
  );
  const isImage = attachment.contentType.startsWith("image/");
  const aspectRatio = attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined;
  const previewUrl = preview.data?.url;

  return (
    <Attachment orientation={isImage ? "vertical" : "horizontal"} state={preview.isError ? "error" : "done"}>
      <AttachmentMedia
        className={aspectRatio ? "aspect-auto *:[img]:aspect-auto" : undefined}
        style={aspectRatio ? { aspectRatio } : undefined}
        variant={isImage ? "image" : "icon"}
      >
        <AttachmentMediaBody
          attachment={attachment}
          isImage={isImage}
          isPending={preview.isPending}
          previewUrl={previewUrl}
        />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
        <AttachmentDescription>
          {preview.isError ? "Could not load preview" : formatBytes(attachment.size)}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label={`Remove ${attachment.fileName}`}
          disabled={isRemoving}
          onClick={onRemove}
          type="button"
        >
          <Trash2Icon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

export function TodoAttachments({ attachments, todoId }: { attachments: TodoAttachmentItem[]; todoId: string }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [inputKey, setInputKey] = useState(0);
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  function invalidateTodos() {
    void queryClient.invalidateQueries(trpc.todo.list.queryFilter());
    void queryClient.invalidateQueries(trpc.todo.attachmentUrl.queryFilter());
  }

  const createUpload = useMutation(trpc.todo.createAttachmentUpload.mutationOptions());
  const completeUpload = useMutation(trpc.todo.completeAttachment.mutationOptions());
  const removeAttachment = useMutation(
    trpc.todo.removeAttachment.mutationOptions({
      onSuccess: invalidateTodos,
    })
  );

  async function uploadFile(file: File) {
    if (!isAllowedType(file.type)) {
      throw new Error("Use a PDF or an image (JPEG, PNG, WebP, or GIF).");
    }
    if (file.size > MAX_TODO_ATTACHMENT_BYTES) {
      throw new Error("Files must be 10 MB or smaller.");
    }

    const dimensions = await readImageDimensions(file);
    const upload = await createUpload.mutateAsync({
      contentType: file.type,
      fileName: file.name,
      todoId,
    });

    const response = await fetch(upload.url, {
      body: file,
      headers: upload.headers,
      method: upload.method,
    });
    if (!response.ok) {
      throw new Error("Could not upload the file.");
    }

    await completeUpload.mutateAsync({
      fileId: String(upload.fileId),
      fileName: file.name,
      height: dimensions.height,
      todoId,
      width: dimensions.width,
    });
  }

  async function uploadFilesInOrder(files: File[]) {
    const [file, ...rest] = files;
    if (!file) {
      return;
    }

    setUploadingName(file.name);
    await uploadFile(file);
    invalidateTodos();
    await uploadFilesInOrder(rest);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const remaining = MAX_TODO_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toastError(new Error(`A todo can have at most ${MAX_TODO_ATTACHMENTS} attachments.`));
      return;
    }

    try {
      await uploadFilesInOrder([...fileList].slice(0, remaining));
    } catch (caught) {
      if (!(caught instanceof TRPCClientError)) {
        toastError(caught);
      }
    } finally {
      setUploadingName(null);
      setInputKey((key) => key + 1);
    }
  }

  const isBusy = uploadingName !== null || removeAttachment.isPending;

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Attachments</FieldLabel>
      {attachments.length > 0 || uploadingName ? (
        <AttachmentGroup>
          {attachments.map((attachment) => (
            <AttachmentPreview
              attachment={{
                ...attachment,
                _id: String(attachment._id),
              }}
              isRemoving={removeAttachment.isPending}
              key={String(attachment._id)}
              onRemove={() => {
                removeAttachment.mutate({
                  fileId: String(attachment._id),
                  todoId,
                });
              }}
              todoId={todoId}
            />
          ))}
          {uploadingName ? (
            <Attachment orientation="vertical" state="uploading">
              <AttachmentMedia>
                <Spinner />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{uploadingName}</AttachmentTitle>
                <AttachmentDescription>Uploading</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          ) : null}
        </AttachmentGroup>
      ) : null}
      <input
        accept={ACCEPT}
        className="sr-only"
        disabled={isBusy || attachments.length >= MAX_TODO_ATTACHMENTS}
        id={inputId}
        key={inputKey}
        multiple
        onChange={(event) => {
          void handleFiles(event.target.files);
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={isBusy || attachments.length >= MAX_TODO_ATTACHMENTS}
        onClick={() => {
          inputRef.current?.click();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <PaperclipIcon />
        Add file
      </Button>
    </Field>
  );
}
