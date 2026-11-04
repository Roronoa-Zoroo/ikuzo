import type { Lifecycle } from "@repo/runtime/lifecycle";
import { connectDb, disconnectDb } from "./client.ts";

export const mongoLifecycle: Lifecycle = {
  name: "mongo",
  start: connectDb,
  stop: disconnectDb,
};
