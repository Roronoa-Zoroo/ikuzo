import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Textarea } from "@repo/ui/components/textarea";
import type { ChangeEvent, ReactNode } from "react";

import { useFieldContext } from "@/components/form/context";
import { fieldErrorItems, isFieldInvalid } from "@/components/form/errors";

export function TextAreaField({
  description,
  id,
  label,
  maxLength,
  placeholder,
  rows = 4,
}: {
  description?: string;
  id: string;
  label: string;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}) {
  const field = useFieldContext<string>();
  const isInvalid = isFieldInvalid(field.state.meta.errors);

  let hint: ReactNode = null;
  if (isInvalid) {
    hint = <FieldError errors={fieldErrorItems(field.state.meta.errors)} />;
  } else if (description) {
    hint = <FieldDescription>{description}</FieldDescription>;
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    field.handleChange(event.target.value);
  }

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        aria-invalid={isInvalid}
        id={id}
        maxLength={maxLength}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        value={field.state.value}
      />
      {hint}
    </Field>
  );
}
