import { serve } from "@hono/node-server";
import { mongoLifecycle } from "@repo/db/lifecycle";
import { boot } from "@repo/runtime/boot";
import { shutdownServer } from "@repo/runtime/http";
import type { Lifecycle } from "@repo/runtime/lifecycle";
import logger from "@repo/runtime/logger";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.ts";
import { createContext } from "./context.ts";
import { ENV } from "./env.ts";
import { redisLifecycle } from "./redis.ts";
import { appRouter } from "./router.ts";

const app = new Hono();

app.use(
  "*",
  cors({
    credentials: true,
    origin: ENV.WEB_ORIGIN,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => c.json({ ok: true }));

app.all("/trpc/*", (c) =>
  fetchRequestHandler({
    createContext: ({ req }) => createContext(req),
    endpoint: "/trpc",
    onError({ error, path, type }) {
      const payload = { code: error.code, err: error, path, type };

      if (error.code === "INTERNAL_SERVER_ERROR") {
        logger.error(payload, "tRPC error");
        return;
      }

      if (
        error.code === "BAD_REQUEST" ||
        error.code === "UNAUTHORIZED" ||
        error.code === "FORBIDDEN" ||
        error.code === "NOT_FOUND" ||
        error.code === "CONFLICT" ||
        error.code === "TOO_MANY_REQUESTS"
      ) {
        logger.debug(payload, "tRPC client error");
        return;
      }

      logger.warn(payload, "tRPC error");
    },
    req: c.req.raw,
    router: appRouter,
  })
);

let httpServer: ReturnType<typeof serve> | undefined;

const httpLifecycle: Lifecycle = {
  name: "http",
  async start() {
    httpServer = await new Promise((resolve) => {
      const server = serve({ fetch: app.fetch, port: ENV.PORT }, (info) => {
        logger.info({ port: info.port }, "API running");
        resolve(server);
      });
    });
  },
  stop() {
    if (!httpServer) {
      return;
    }

    return shutdownServer(httpServer);
  },
};

await boot({
  lifecycles: [mongoLifecycle, redisLifecycle, httpLifecycle],
});
