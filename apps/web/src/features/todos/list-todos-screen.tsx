import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import { ItemGroup } from "@repo/ui/components/item";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { AddTodoForm } from "@/features/todos/add-todo-form";
import { EditTodoSheet } from "@/features/todos/edit-todo-sheet";
import { TodoFilters, type TodoStatusFilter } from "@/features/todos/todo-filters";
import { type TodoItem, TodoRow } from "@/features/todos/todo-row";
import { useTRPC } from "@/lib/trpc";

function ListScreenLayout({ action, children, title }: { action?: ReactNode; children: ReactNode; title: string }) {
  return (
    <main className="min-w-0 flex-1 bg-muted/30 p-4 lg:p-6">
      <Card className="mx-auto w-full max-w-3xl shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>{title}</CardTitle>
          <CardDescription>Notes, due dates, and priority for this list</CardDescription>
          {action}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{children}</CardContent>
      </Card>
    </main>
  );
}

function ListScreenSkeleton() {
  return (
    <ListScreenLayout title="List">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </ListScreenLayout>
  );
}

function ListLoadError() {
  return (
    <ListScreenLayout title="List">
      <Alert variant="destructive">
        <AlertDescription>Could not load lists. Try again.</AlertDescription>
      </Alert>
    </ListScreenLayout>
  );
}

function TodoRows({
  isDeleting,
  onDelete,
  onEdit,
  onToggle,
  todos,
}: {
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
  onToggle: (id: string) => void;
  todos: TodoItem[];
}) {
  if (todos.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No todos in this view</EmptyTitle>
          <EmptyDescription>Add a task, or clear search and filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-2">
      {todos.map((todo) => (
        <TodoRow
          isDeleting={isDeleting}
          key={todo._id}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggle={onToggle}
          todo={todo}
        />
      ))}
    </ItemGroup>
  );
}

function ListTodosContent({
  list,
  lists,
  q,
  statusFilter,
}: {
  list: { _id: string; name: string };
  lists: Array<{ _id: string; name: string }>;
  q?: string;
  statusFilter?: TodoStatusFilter;
}) {
  const status = statusFilter ?? "all";
  const navigate = useNavigate({ from: "/lists/$listId" });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TodoItem | null>(null);

  const todos = useQuery(
    trpc.todo.list.queryOptions({
      listId: list._id,
      q: q || undefined,
      status,
    })
  );

  function invalidateTodos() {
    void queryClient.invalidateQueries(trpc.todo.list.queryFilter());
  }

  const addTodo = useMutation(
    trpc.todo.add.mutationOptions({
      onSuccess: invalidateTodos,
    })
  );

  const toggleTodo = useMutation(
    trpc.todo.toggle.mutationOptions({
      onSuccess: invalidateTodos,
    })
  );

  const deleteTodo = useMutation(
    trpc.todo.delete.mutationOptions({
      onSuccess: invalidateTodos,
    })
  );

  const updateTodo = useMutation(
    trpc.todo.update.mutationOptions({
      onSuccess: () => {
        invalidateTodos();
        setEditing(null);
      },
    })
  );

  const remaining = todos.data?.filter((todo) => !todo.completed).length ?? 0;

  return (
    <>
      <ListScreenLayout
        action={
          todos.data ? (
            <CardAction>
              <Badge variant="secondary">{remaining} remaining</Badge>
            </CardAction>
          ) : undefined
        }
        title={list.name}
      >
        <AddTodoForm
          listId={list._id}
          onAdd={async (input) => {
            await addTodo.mutateAsync(input);
          }}
        />
        <TodoFilters
          onSearch={(nextQuery) => {
            void navigate({
              search: (previous) => ({
                ...previous,
                q: nextQuery || undefined,
              }),
            });
          }}
          onStatusChange={(nextStatus: TodoStatusFilter) => {
            void navigate({
              search: (previous) => ({
                ...previous,
                status: nextStatus,
              }),
            });
          }}
          q={q ?? ""}
          status={status}
        />
        {todos.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}
        {todos.isError ? (
          <Alert variant="destructive">
            <AlertDescription>Could not load todos. Try again.</AlertDescription>
          </Alert>
        ) : null}
        {todos.data ? (
          <TodoRows
            isDeleting={deleteTodo.isPending}
            onDelete={(id) => {
              deleteTodo.mutate({ _id: id });
            }}
            onEdit={setEditing}
            onToggle={(id) => {
              toggleTodo.mutate({ _id: id });
            }}
            todos={todos.data}
          />
        ) : null}
      </ListScreenLayout>
      <EditTodoSheet
        lists={lists}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSave={async (input) => {
          await updateTodo.mutateAsync(input);
          if (input.listId !== list._id) {
            await navigate({
              params: { listId: input.listId },
              to: "/lists/$listId",
            });
          }
        }}
        todo={editing ? (todos.data?.find((item) => String(item._id) === String(editing._id)) ?? editing) : null}
      />
    </>
  );
}

export function ListTodosScreen({
  listId,
  q,
  statusFilter,
}: {
  listId: string;
  q?: string;
  statusFilter?: TodoStatusFilter;
}) {
  const trpc = useTRPC();
  const lists = useQuery(trpc.list.list.queryOptions());
  const list = lists.data?.find((item) => item._id === listId);
  const fallbackListId = lists.data?.[0]?._id;

  if (lists.isPending) {
    return <ListScreenSkeleton />;
  }

  if (lists.isError || !fallbackListId) {
    return <ListLoadError />;
  }

  if (!list) {
    return <Navigate params={{ listId: fallbackListId }} replace to="/lists/$listId" />;
  }

  return <ListTodosContent list={list} lists={lists.data} q={q} statusFilter={statusFilter} />;
}
