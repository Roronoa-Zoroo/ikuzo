import { withTransaction } from "@repo/db/client";
import { List } from "@repo/db/models/list";
import { Todo } from "@repo/db/models/todo";
import { TRPCError } from "@trpc/server";
import type { ObjectId } from "mongodb";
import { z } from "zod";

import { objectIdInput } from "../../lib/object-id.ts";
import { deleteStoredObjects } from "../../lib/object-storage.ts";
import { protectedProcedure, router } from "../../trpc.ts";

const listName = z.string().trim().min(1, "Name is required").max(80);

async function listsForUser(userId: ObjectId) {
  const existing = await List.find({ userId }, { sort: { createdAt: 1 } });
  if (existing.length > 0) {
    return existing;
  }

  const inbox = await withTransaction(async (session) => {
    const created = await List.insertOne({ name: "Inbox", userId }, { session });
    await Todo.updateMany({ userId }, { $set: { listId: created._id } }, { session });
    return created;
  });

  return [inbox];
}

export const listRouter = router({
  create: protectedProcedure.input(z.object({ name: listName })).mutation(
    async ({ ctx, input }) =>
      await List.insertOne({
        name: input.name,
        userId: ctx.userId,
      })
  ),
  delete: protectedProcedure.input(z.object({ _id: objectIdInput })).mutation(async ({ ctx, input }) => {
    const lists = await listsForUser(ctx.userId);
    if (lists.length < 2) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Keep at least one list." });
    }

    const list = await List.findOne({ _id: input._id, userId: ctx.userId });
    if (!list) {
      throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
    }

    const todos = await Todo.find({ listId: input._id, userId: ctx.userId }, { projection: { attachments: 1 } });
    const keys = todos.flatMap((todo) => (todo.attachments ?? []).map((attachment) => attachment.key));

    await withTransaction(async (session) => {
      await Todo.deleteMany({ listId: input._id, userId: ctx.userId }, { session });
      await List.deleteOne({ _id: input._id, userId: ctx.userId }, { session });
    });

    await deleteStoredObjects(keys);

    return { ok: true as const };
  }),
  list: protectedProcedure.query(async ({ ctx }) => await listsForUser(ctx.userId)),
  rename: protectedProcedure
    .input(z.object({ _id: objectIdInput, name: listName }))
    .mutation(async ({ ctx, input }) => {
      const list = await List.findOne({ _id: input._id, userId: ctx.userId });
      if (!list) {
        throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
      }

      await List.updateOne({ _id: input._id, userId: ctx.userId }, { $set: { name: input.name } });

      return { ok: true as const };
    }),
});
