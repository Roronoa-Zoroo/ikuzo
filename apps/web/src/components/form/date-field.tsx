import { Button } from "@repo/ui/components/button";
import { Calendar } from "@repo/ui/components/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useFieldContext } from "@/components/form/context";
import { fieldErrorItems, isFieldInvalid } from "@/components/form/errors";

function parseDateValue(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!(year && month && day)) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DateField({ description, id, label }: { description?: string; id: string; label: string }) {
  const field = useFieldContext<string>();
  const isInvalid = isFieldInvalid(field.state.meta.errors);
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(field.state.value);

  let hint: ReactNode = null;
  if (isInvalid) {
    hint = <FieldError errors={fieldErrorItems(field.state.meta.errors)} />;
  } else if (description) {
    hint = <FieldDescription>{description}</FieldDescription>;
  }

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-invalid={isInvalid}
              className="w-full justify-between font-normal data-[empty=true]:text-muted-foreground"
              data-empty={!selected}
              id={id}
              variant="outline"
            />
          }
        >
          {selected ? formatDateLabel(selected) : "Pick a date"}
          <ChevronDownIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto overflow-hidden p-0">
          <Calendar
            captionLayout="dropdown"
            defaultMonth={selected}
            mode="single"
            onSelect={(next) => {
              field.handleChange(next ? formatDateValue(next) : "");
              setOpen(false);
            }}
            selected={selected}
          />
          {selected ? (
            <div className="border-t p-1">
              <Button
                className="w-full"
                onClick={() => {
                  field.handleChange("");
                  setOpen(false);
                }}
                size="sm"
                variant="ghost"
              >
                Clear date
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {hint}
    </Field>
  );
}
