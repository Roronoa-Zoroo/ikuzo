import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ListTodosScreen } from "@/features/todos/list-todos-screen";
import { pageHead } from "@/lib/seo";

const listSearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "all", "completed"]).optional(),
});

export const Route = createFileRoute("/_authenticated/lists/$listId")({
  component: ListPage,
  head: () =>
    pageHead({
      noIndex: true,
      title: "Todos",
    }),
  validateSearch: (search) => listSearchSchema.parse(search),
});

function ListPage() {
  const { listId } = Route.useParams();
  const { q, status } = Route.useSearch();

  return <ListTodosScreen listId={listId} q={q} statusFilter={status} />;
}
