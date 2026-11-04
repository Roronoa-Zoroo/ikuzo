import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/input-group";
import type { ChangeEvent, ReactNode } from "react";

import { useFieldContext } from "@/components/form/context";
import { fieldErrorItems, isFieldInvalid } from "@/components/form/errors";

export function TextField({
  action,
  autoComplete,
  description,
  id,
  label,
  maxLength,
  placeholder,
  type = "text",
}: {
  action?: ReactNode;
  autoComplete?: string;
  description?: string;
  id: string;
  label: string;
  maxLength?: number;
  placeholder?: string;
  type?: "email" | "password" | "search" | "text";
}) {
  const field = useFieldContext<string>();
  const isInvalid = isFieldInvalid(field.state.meta.errors);

  const inputProps = {
    "aria-invalid": isInvalid,
    autoComplete,
    id,
    maxLength,
    name: field.name,
    onBlur: field.handleBlur,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      field.handleChange(event.target.value);
    },
    placeholder,
    type,
    value: field.state.value,
  };

  let hint: ReactNode = null;
  if (isInvalid) {
    hint = <FieldError errors={fieldErrorItems(field.state.meta.errors)} />;
  } else if (description) {
    hint = <FieldDescription>{description}</FieldDescription>;
  }

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {action ? (
        <InputGroup>
          <InputGroupInput {...inputProps} />
          <InputGroupAddon align="inline-end">{action}</InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...inputProps} />
      )}
      {hint}
    </Field>
  );
}
