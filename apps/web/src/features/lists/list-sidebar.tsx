import { Button } from "@repo/ui/components/button";
import { FieldGroup } from "@repo/ui/components/field";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ListIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { useTRPC } from "@/lib/trpc";

export function ListSidebar() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeListId = "listId" in params ? params.listId : undefined;

  const lists = useQuery(trpc.list.list.queryOptions());

  function invalidateLists() {
    void queryClient.invalidateQueries(trpc.list.list.queryFilter());
  }

  const createList = useMutation(
    trpc.list.create.mutationOptions({
      onSuccess: async (list) => {
        invalidateLists();
        await navigate({
          params: { listId: list._id },
          to: "/lists/$listId",
        });
      },
    })
  );

  const deleteList = useMutation(
    trpc.list.delete.mutationOptions({
      onSuccess: async () => {
        invalidateLists();
        const remaining = lists.data?.filter((list) => list._id !== activeListId);
        const next = remaining?.[0];
        if (next) {
          await navigate({
            params: { listId: next._id },
            to: "/lists/$listId",
          });
        }
      },
    })
  );

  const form = useAppForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ formApi, value }) => {
      await createList.mutateAsync({ name: value.name.trim() });
      formApi.reset();
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, "Name is required").max(80),
      }),
    },
  });

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r bg-sidebar px-3 py-5 text-sidebar-foreground">
      <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Lists</p>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-1 pr-2">
          {lists.data?.map((list) => {
            const isActive = list._id === activeListId;

            return (
              <div className="flex items-center gap-1" key={list._id}>
                <Button
                  className="min-w-0 flex-1 justify-start"
                  nativeButton={false}
                  render={<Link params={{ listId: list._id }} to="/lists/$listId" />}
                  size="sm"
                  variant={isActive ? "secondary" : "ghost"}
                >
                  <ListIcon data-icon="inline-start" />
                  <span className="truncate">{list.name}</span>
                </Button>
                {lists.data.length > 1 ? (
                  <Tooltip>
                    <TooltipTrigger
                      onClick={() => {
                        deleteList.mutate({ _id: list._id });
                      }}
                      render={
                        <Button
                          aria-label={`Delete ${list.name}`}
                          disabled={deleteList.isPending}
                          size="icon-sm"
                          variant="ghost"
                        />
                      }
                    >
                      <Trash2Icon />
                    </TooltipTrigger>
                    <TooltipContent>Delete list</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />
      <form.AppForm>
        <form.Form>
          <FieldGroup>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  action={
                    <form.SubmitButton disabled={!field.state.value.trim()} group size="xs">
                      Add
                    </form.SubmitButton>
                  }
                  autoComplete="off"
                  id="list-name"
                  label="New list"
                  maxLength={80}
                  placeholder="Work"
                />
              )}
            </form.AppField>
          </FieldGroup>
        </form.Form>
      </form.AppForm>
    </aside>
  );
}
