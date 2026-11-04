import { List } from "@repo/db/models/list";
import { Todo, type TodoDocument } from "@repo/db/models/todo";
import { sanitizeFileName } from "@repo/storage/utils";
import { TRPCError } from "@trpc/server";
import { ObjectId } from "mongodb";
import type { PaprUpdateFilter, Projection } from "papr";
import { z } from "zod";

import { escapeRegex } from "../../lib/escape-regex.ts";
import { objectIdInput } from "../../lib/object-id.ts";
import { deleteStoredObjects, objectStorage } from "../../lib/object-storage.ts";
import { protectedProcedure, router } from "../../trpc.ts";
import {
  MAX_TODO_ATTACHMENT_BYTES,
  MAX_TODO_ATTACHMENTS,
  parseAttachmentContentType,
  todoAttachmentContentType,
  todoAttachmentDimension,
  todoAttachmentFileName,
  todoPriority,
  todoStatusFilter,
} from "./schemas.ts";

const todoProjection: Projection<TodoDocument> = {
  attachments: 1,
  completed: 1,
  createdAt: 1,
  dueAt: 1,
  listId: 1,
  notes: 1,
  priority: 1,
  title: 1,
};

function todoAttachmentKey(userId: ObjectId, todoId: ObjectId, fileId: ObjectId) {
  return `users/${userId.toString()}/todos/${todoId.toString()}/${fileId.toString()}`;
}

async function requireTodo(userId: ObjectId, todoId: ObjectId) {
  const todo = await Todo.findOne({ _id: todoId, userId }, { projection: todoProjection });
  if (!todo) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found" });
  }
  return todo;
}

async function requireOwnedList(userId: ObjectId, listId: ObjectId) {
  const list = await List.findOne({ _id: listId, userId });
  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
  }
  return list;
}

export const todoRouter = router({
  add: protectedProcedure
    .input(
      z.object({
        dueAt: z.iso.date().optional(),
        listId: objectIdInput,
        notes: z.string().trim().max(2000).optional(),
        priority: todoPriority.default("medium"),
        title: z.string().trim().min(1, "Title is required").max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOwnedList(ctx.userId, input.listId);

      const todo = await Todo.insertOne({
        attachments: [],
        completed: false,
        dueAt: input.dueAt,
        listId: input.listId,
        notes: input.notes || undefined,
        priority: input.priority,
        title: input.title,
        userId: ctx.userId,
      });

      return todo;
    }),
  attachmentUrl: protectedProcedure
    .input(z.object({ fileId: objectIdInput, todoId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const todo = await requireTodo(ctx.userId, input.todoId);
      const attachment = (todo.attachments ?? []).find((item) => item._id.equals(input.fileId));
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }

      return await objectStorage.createDownloadUrl({
        fileName: attachment.fileName,
        key: attachment.key,
      });
    }),
  completeAttachment: protectedProcedure
    .input(
      z
        .object({
          fileId: objectIdInput,
          fileName: todoAttachmentFileName,
          height: todoAttachmentDimension.optional(),
          todoId: objectIdInput,
          width: todoAttachmentDimension.optional(),
        })
        .refine((value) => (value.width === undefined) === (value.height === undefined), {
          message: "Width and height are required together",
        })
    )
    .mutation(async ({ ctx, input }) => {
      const todo = await requireTodo(ctx.userId, input.todoId);
      const existing = (todo.attachments ?? []).find((item) => item._id.equals(input.fileId));
      if (existing) {
        return existing;
      }

      if ((todo.attachments?.length ?? 0) >= MAX_TODO_ATTACHMENTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A todo can have at most ${MAX_TODO_ATTACHMENTS} attachments`,
        });
      }

      const key = todoAttachmentKey(ctx.userId, input.todoId, input.fileId);
      const metadata = await objectStorage.getObjectMetadata(key);

      const contentType = parseAttachmentContentType(metadata.contentType);
      if (!contentType) {
        await deleteStoredObjects([key]);
        throw new TRPCError({ code: "BAD_REQUEST", message: "This file type is not allowed" });
      }

      const size = metadata.contentLength;
      if (size === undefined || size < 1 || size > MAX_TODO_ATTACHMENT_BYTES) {
        await deleteStoredObjects([key]);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Files must be between 1 byte and ${MAX_TODO_ATTACHMENT_BYTES} bytes`,
        });
      }

      const fileName = sanitizeFileName(input.fileName);
      const isImage = contentType.startsWith("image/");

      const attachment = {
        _id: input.fileId,
        contentType,
        createdAt: new Date(),
        etag: metadata.etag,
        fileName,
        key,
        size,
        ...(isImage && input.width !== undefined ? { height: input.height, width: input.width } : {}),
      };

      const result = await Todo.collection.updateOne(
        {
          _id: input.todoId,
          $expr: {
            $lt: [{ $size: "$attachments" }, MAX_TODO_ATTACHMENTS],
          },
          userId: ctx.userId,
        },
        { $push: { attachments: attachment } }
      );

      if (result.modifiedCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A todo can have at most ${MAX_TODO_ATTACHMENTS} attachments`,
        });
      }

      return attachment;
    }),
  createAttachmentUpload: protectedProcedure
    .input(
      z.object({
        contentType: todoAttachmentContentType,
        fileName: todoAttachmentFileName,
        todoId: objectIdInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const todo = await requireTodo(ctx.userId, input.todoId);
      if ((todo.attachments?.length ?? 0) >= MAX_TODO_ATTACHMENTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A todo can have at most ${MAX_TODO_ATTACHMENTS} attachments`,
        });
      }

      const fileId = new ObjectId();
      const key = todoAttachmentKey(ctx.userId, input.todoId, fileId);

      sanitizeFileName(input.fileName);
      const upload = await objectStorage.createUploadUrl({
        contentType: input.contentType,
        key,
      });

      return {
        expiresAt: upload.expiresAt,
        fileId,
        headers: upload.headers,
        method: upload.method,
        url: upload.url,
      };
    }),
  delete: protectedProcedure.input(z.object({ _id: objectIdInput })).mutation(async ({ ctx, input }) => {
    const existing = await requireTodo(ctx.userId, input._id);
    await deleteStoredObjects((existing.attachments ?? []).map((attachment) => attachment.key));

    await Todo.deleteOne({
      _id: input._id,
      userId: ctx.userId,
    });

    return { ok: true as const };
  }),
  list: protectedProcedure
    .input(
      z.object({
        listId: objectIdInput,
        q: z.string().trim().max(100).optional(),
        status: todoStatusFilter.default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOwnedList(ctx.userId, input.listId);

      const filter: {
        completed?: boolean;
        listId: ObjectId;
        title?: { $options: "i"; $regex: string };
        userId: ObjectId;
      } = {
        listId: input.listId,
        userId: ctx.userId,
      };

      if (input.status === "active") {
        filter.completed = false;
      } else if (input.status === "completed") {
        filter.completed = true;
      }

      if (input.q) {
        filter.title = { $options: "i", $regex: escapeRegex(input.q) };
      }

      const todos = await Todo.find(filter, {
        projection: todoProjection,
        sort: { completed: 1, createdAt: -1 },
      });

      return todos;
    }),
  removeAttachment: protectedProcedure
    .input(z.object({ fileId: objectIdInput, todoId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const todo = await requireTodo(ctx.userId, input.todoId);
      const attachment = (todo.attachments ?? []).find((item) => item._id.equals(input.fileId));
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }

      await deleteStoredObjects([attachment.key]);
      await Todo.updateOne(
        { _id: input.todoId, userId: ctx.userId },
        { $pull: { attachments: { _id: input.fileId } } }
      );

      return { ok: true as const };
    }),
  toggle: protectedProcedure.input(z.object({ _id: objectIdInput })).mutation(async ({ ctx, input }) => {
    const existing = await requireTodo(ctx.userId, input._id);

    await Todo.updateOne(
      { _id: input._id, userId: ctx.userId },
      {
        $set: {
          completed: !existing.completed,
        },
      }
    );

    return {
      ...existing,
      completed: !existing.completed,
    };
  }),
  update: protectedProcedure
    .input(
      z.object({
        _id: objectIdInput,
        dueAt: z.iso.date().nullable().optional(),
        listId: objectIdInput.optional(),
        notes: z.string().trim().max(2000).optional(),
        priority: todoPriority.optional(),
        title: z.string().trim().min(1, "Title is required").max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await requireTodo(ctx.userId, input._id);

      const nextListId = input.listId ?? existing.listId;
      await requireOwnedList(ctx.userId, nextListId);

      const $set: PaprUpdateFilter<TodoDocument>["$set"] = {
        listId: nextListId,
        notes: input.notes === undefined ? existing.notes : input.notes || undefined,
        priority: input.priority ?? existing.priority,
        title: input.title ?? existing.title,
      };

      if (input.dueAt) {
        $set.dueAt = input.dueAt;
      }

      await Todo.updateOne(
        { _id: input._id, userId: ctx.userId },
        input.dueAt === null ? { $set, $unset: { dueAt: 1 as const } } : { $set }
      );

      return { ok: true as const };
    }),
});
