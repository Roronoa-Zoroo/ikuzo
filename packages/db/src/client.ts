import { type ClientSession, MongoClient } from "mongodb";

import "./models/account.ts";
import { ensureListIndexes } from "./models/list.ts";
import { ensureTodoIndexes } from "./models/todo.ts";
import "./models/user.ts";
import "./models/verification.ts";
import { papr } from "./papr.ts";

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  return uri;
}

export const client = new MongoClient(getMongoUri());
export const db = client.db();

let connecting: Promise<void> | undefined;

export async function connectDb() {
  connecting ??= (async () => {
    await client.connect();
    papr.initialize(db);
    await papr.updateSchemas();
    await Promise.all([ensureListIndexes(), ensureTodoIndexes()]);
  })();

  await connecting;
}

export async function disconnectDb() {
  connecting = undefined;
  await client.close();
}

export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}
