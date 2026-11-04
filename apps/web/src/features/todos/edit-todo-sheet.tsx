import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@repo/ui/components/sheet";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { TodoAttachments } from "@/features/todos/todo-attachments";
import type { TodoItem } from "@/features/todos/todo-row";

const PRIORITY_ITEMS = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
] as const;

const PRIORITIES = ["high", "low", "medium"] as const;

function EditTodoForm({
  lists,
  onSave,
  todo,
}: {
  lists: Array<{ _id: string; name: string }>;
  onSave: (input: {
    _id: string;
    dueAt: string | null;
    listId: string;
    notes: string;
    priority: TodoItem["priority"];
    title: string;
  }) => Promise<void>;
  todo: TodoItem;
}) {
  const listItems = lists.map((list) => ({
    label: list.name,
    value: list._id,
  }));

  const form = useAppForm({
    defaultValues: {
      dueAt: todo.dueAt ?? "",
      listId: todo.listId,
      notes: todo.notes ?? "",
      priority: todo.priority,
      title: todo.title,
    },
    onSubmit: async ({ value }) => {
      await onSave({
        _id: todo._id,
        dueAt: value.dueAt ? value.dueAt : null,
        listId: value.listId,
        notes: value.notes.trim(),
        priority: value.priority,
        title: value.title.trim(),
      });
    },
    validators: {
      onSubmit: z.object({
        dueAt: z.string(),
        listId: z.string().min(1),
        notes: z.string().max(2000),
        priority: z.enum(PRIORITIES),
        title: z.string().trim().min(1, "Title is required").max(200),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4 px-4">
        <FieldGroup>
          <form.AppField name="title">
            {(field) => <field.TextField id="edit-title" label="Title" maxLength={200} />}
          </form.AppField>
          <form.AppField name="notes">
            {(field) => (
              <field.TextAreaField id="edit-notes" label="Notes" maxLength={2000} placeholder="Optional details" />
            )}
          </form.AppField>
          <form.AppField name="dueAt">{(field) => <field.DateField id="edit-due" label="Due date" />}</form.AppField>
          <form.AppField name="priority">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="edit-priority">Priority</FieldLabel>
                <Select
                  items={PRIORITY_ITEMS}
                  onValueChange={(value) => {
                    if (value === "high" || value === "low" || value === "medium") {
                      field.handleChange(value);
                    }
                  }}
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full" id="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} side="bottom">
                    <SelectGroup>
                      {PRIORITY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.AppField>
          <form.AppField name="listId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="edit-list">List</FieldLabel>
                <Select
                  items={listItems}
                  onValueChange={(value) => {
                    if (typeof value === "string" && value.length > 0) {
                      field.handleChange(value);
                    }
                  }}
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full" id="edit-list">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} side="bottom">
                    <SelectGroup>
                      {listItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.AppField>
        </FieldGroup>
        <SheetFooter>
          <form.SubmitButton>Save</form.SubmitButton>
        </SheetFooter>
      </form.Form>
    </form.AppForm>
  );
}

export function EditTodoSheet({
  lists,
  onOpenChange,
  onSave,
  todo,
}: {
  lists: Array<{ _id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    _id: string;
    dueAt: string | null;
    listId: string;
    notes: string;
    priority: TodoItem["priority"];
    title: string;
  }) => Promise<void>;
  todo: TodoItem | null;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(todo)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit todo</SheetTitle>
          <SheetDescription>Notes, due date, priority, list, and files.</SheetDescription>
        </SheetHeader>
        {todo ? (
          <>
            <EditTodoForm key={todo._id} lists={lists} onSave={onSave} todo={todo} />
            <div className="px-4 pb-4">
              <TodoAttachments attachments={todo.attachments ?? []} todoId={String(todo._id)} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
