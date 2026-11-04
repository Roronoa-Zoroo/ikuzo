import type { Lifecycle } from "@repo/runtime/lifecycle";
import { Redis } from "ioredis";
import { ENV } from "./env.ts";

export const redis = new Redis(ENV.REDIS_URL, {
  lazyConnect: true,
});

export const redisLifecycle: Lifecycle = {
  name: "redis",
  start: () => redis.connect(),
  async stop() {
    await redis.quit();
  },
};
