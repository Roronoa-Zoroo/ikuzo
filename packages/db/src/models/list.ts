import { schema, types } from "papr";

import { papr } from "../papr.ts";

export const listSchema = schema(
  {
    name: types.string({ required: true }),
    userId: types.objectId({ required: true }),
  },
  { timestamps: true }
);

export type ListDocument = (typeof listSchema)[0];

export const List = papr.model("list", listSchema);

export async function ensureListIndexes() {
  await List.collection.createIndex(["userId", "createdAt"]);
}
