import { schema, types } from "papr";

import { papr } from "../papr.ts";

export const TODO_PRIORITIES = ["high", "low", "medium"] as const;

const todoAttachmentSchema = types.object({
  _id: types.objectId({ required: true }),
  contentType: types.string({ required: true }),
  createdAt: types.date({ required: true }),
  etag: types.string(),
  fileName: types.string({ required: true }),
  height: types.number(),
  key: types.string({ required: true }),
  size: types.number({ required: true }),
  width: types.number(),
});

export const todoSchema = schema(
  {
    attachments: types.array(todoAttachmentSchema),
    completed: types.boolean({ required: true }),
    dueAt: types.string(),
    listId: types.objectId({ required: true }),
    notes: types.string(),
    priority: types.enum(TODO_PRIORITIES, { required: true }),
    title: types.string({ required: true }),
    userId: types.objectId({ required: true }),
  },
  { defaults: { attachments: [] }, timestamps: true }
);

export type TodoDocument = (typeof todoSchema)[0];
export type TodoAttachment = NonNullable<TodoDocument["attachments"]>[number];
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const Todo = papr.model("todo", todoSchema);

export async function ensureTodoIndexes() {
  await Todo.collection.createIndex(["userId", "listId", ["createdAt", -1]]);
}
