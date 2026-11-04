import { initTRPC, TRPCError } from "@trpc/server";
import { ObjectId } from "mongodb";

import type { Context } from "./context.ts";

const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      return {
        ...shape,
        message: "Internal server error",
      };
    }

    return shape;
  },
});

export const { router } = t;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(function isAuthed(opts) {
  const { ctx } = opts;
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      session: ctx.session,
      userId: new ObjectId(ctx.session.user.id),
    },
  });
});
