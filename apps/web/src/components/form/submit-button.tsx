import { Button } from "@repo/ui/components/button";
import { InputGroupButton } from "@repo/ui/components/input-group";
import { Spinner } from "@repo/ui/components/spinner";
import type { ReactNode } from "react";

import { useFormContext } from "@/components/form/context";

export function SubmitButton({
  children,
  disabled,
  group = false,
  size,
  variant,
}: {
  children: ReactNode;
  disabled?: boolean;
  group?: boolean;
  size?: "default" | "sm" | "xs";
  variant?: "default" | "outline";
}) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => {
        const isDisabled = Boolean(disabled) || isSubmitting;
        let content: ReactNode = children;
        if (isSubmitting) {
          content = group ? (
            <Spinner />
          ) : (
            <>
              <Spinner data-icon="inline-start" />
              {children}
            </>
          );
        }

        if (group) {
          return (
            <InputGroupButton disabled={isDisabled} size={size === "xs" ? "xs" : "sm"} type="submit" variant={variant}>
              {content}
            </InputGroupButton>
          );
        }

        return (
          <Button disabled={isDisabled} size={size === "xs" ? "sm" : size} type="submit" variant={variant}>
            {content}
          </Button>
        );
      }}
    </form.Subscribe>
  );
}
