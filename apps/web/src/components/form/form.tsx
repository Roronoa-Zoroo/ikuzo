import type { ReactNode, SubmitEvent } from "react";

import { useFormContext } from "@/components/form/context";

export function Form({ children, className }: { children: ReactNode; className?: string }) {
  const form = useFormContext();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
