import { Spinner } from "@repo/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_authenticated/")({ component: HomeRedirect });

function HomeRedirect() {
  const trpc = useTRPC();
  const lists = useQuery(trpc.list.list.queryOptions());
  const first = lists.data?.[0];

  if (lists.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 bg-muted/30 text-muted-foreground text-sm">
        <Spinner />
        Loading lists
      </div>
    );
  }

  if (!first) {
    return <p className="p-6 text-destructive text-sm">Could not load lists.</p>;
  }

  return <Navigate params={{ listId: first._id }} to="/lists/$listId" />;
}
