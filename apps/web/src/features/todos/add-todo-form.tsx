import { FieldGroup } from "@repo/ui/components/field";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";

export function AddTodoForm({
  listId,
  onAdd,
}: {
  listId: string;
  onAdd: (input: { listId: string; title: string }) => Promise<void>;
}) {
  const form = useAppForm({
    defaultValues: {
      title: "",
    },
    onSubmit: async ({ formApi, value }) => {
      await onAdd({ listId, title: value.title.trim() });
      formApi.reset();
    },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1, "Title is required").max(200),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form>
        <FieldGroup>
          <form.AppField name="title">
            {(field) => (
              <field.TextField
                action={
                  <form.SubmitButton disabled={!field.state.value.trim()} group size="xs">
                    Add
                  </form.SubmitButton>
                }
                autoComplete="off"
                id="todo-title"
                label="New todo"
                maxLength={200}
                placeholder="Add a task"
              />
            )}
          </form.AppField>
        </FieldGroup>
      </form.Form>
    </form.AppForm>
  );
}
