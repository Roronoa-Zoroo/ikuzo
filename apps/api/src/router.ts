import { listRouter } from "./modules/list/router.ts";
import { todoRouter } from "./modules/todo/router.ts";
import { protectedProcedure, router } from "./trpc.ts";

export const appRouter = router({
  list: listRouter,
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
