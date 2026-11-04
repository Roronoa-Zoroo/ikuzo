import { TODO_PRIORITIES } from "@repo/db/models/todo";
import { z } from "zod";

export const todoPriority = z.enum(TODO_PRIORITIES);

export const todoStatusFilter = z.enum(["active", "all", "completed"]);

export const MAX_TODO_ATTACHMENTS = 10;
export const MAX_TODO_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const TODO_ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const todoAttachmentContentType = z.enum(TODO_ATTACHMENT_CONTENT_TYPES);

export const todoAttachmentFileName = z.string().trim().min(1).max(200);

export const todoAttachmentDimension = z.number().int().min(1).max(20_000);

const allowedAttachmentTypes = new Set<string>(TODO_ATTACHMENT_CONTENT_TYPES);

export function parseAttachmentContentType(value: string | undefined) {
  const [type] = (value ?? "").split(";");
  const normalized = type?.trim().toLowerCase();
  if (!(normalized && allowedAttachmentTypes.has(normalized))) {
    return;
  }

  return normalized as (typeof TODO_ATTACHMENT_CONTENT_TYPES)[number];
}
